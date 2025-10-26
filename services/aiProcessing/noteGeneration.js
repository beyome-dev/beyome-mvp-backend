const config = require('../config');
// const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');
const fs = require('fs');

const mongoose = require('mongoose');
const clientService = require('./client.service');
const bookingService = require("./booking.service");
const { requestTranscription } = require('../services/audioProcessing/transcribeAudio.service');
const { Client, Booking, Note, Prompt } = require('../models');
const puppeteer = require('puppeteer');
const { VertexAI } = require('@google-cloud/vertexai');

const WEBHOOK_URL = `${config.APP_URL}/api/webhook/salad`;
// const AI_MODEL = config.google.aiModel 
// const GEMINI_API_KEY = config.google.apiKey;
const uploadDir = path.join(__dirname, '../uploads');
const PROJECT_ID =  config.google.projectID;
const LOCATION =  config.google.projectLocation || 'us-central1';


// Initialize clients
const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
// const model = vertexAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

/**
 * Default clinical system instruction
 * This is used for all clinical documentation
 */
const DEFAULT_CLINICAL_INSTRUCTION = `You are a professional medical documentation assistant specialized in creating clinical notes. 

Your responsibilities:
- Generate structured, professional clinical documentation following standard medical formatting
- Use appropriate medical terminology while maintaining clarity
- Organize information using SOAP (Subjective, Objective, Assessment, Plan) format when applicable
- Maintain patient confidentiality and professional tone
- Be precise and comprehensive in documenting medical information
- Follow clinical documentation best practices
- Use standard medical abbreviations appropriately
- Structure notes for easy review by healthcare professionals

Always maintain:
- Professional medical writing style
- Clear, concise language
- Proper medical documentation standards
- Logical flow of information
- Accurate representation of the clinical encounter

IMPORTANT COMPLIANCE NOTES:
- Do not fabricate or assume medical information not present in the transcript
- Clearly indicate when information is missing with [Not mentioned] or [Not documented]
- Maintain HIPAA compliance by not adding patient identifiers unless present in transcript
- Use professional medical language appropriate for the medical record`;

/**
 * Get or create a model with specific system instructions
 */
function getModelWithInstructions(systemInstruction = null) {
  if (!systemInstruction) {
    systemInstruction = DEFAULT_CLINICAL_INSTRUCTION;
  }
  return vertexAI.getGenerativeModel({
    model: config.google.aiModel || 'gemini-2.5-flash',
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemInstruction }]
    }
  });
}



/**
 * Generates a SOAP note based on the provided transcript data.
 * @param {string} transcript - The transcript text from Salad.
 * @param {object} io - The Socket.io instance to emit the result.
 */
const generateSOAPNote = async (transcript, noteId, io, promptId) => {
    try {
        let note = await Note.findById(noteId);
        if (!note) {
            throw new Error("Note not found or failed to update.");
        }
        if (promptId) {
            note.prompt = promptId
        }
        const prompt = await Prompt.findById(note.prompt);
        if (!prompt._id) {
            throw new Error("No prompt found");
        }
        note.noteFormat = prompt.formatName
        const promptText = `${prompt.promptText[0]}\n${transcript}`;

        
        const model = getModelWithInstructions(prompt.systemInstructions);

        // Generate SOAP note
        let result = await model.generateContent(promptText);
        const soapNote = extractTextFromResponse(result);
        io.emit('soapNoteGenerated', { soapNote });

        // Generate summary with a unique prompt to avoid repetition
        const summaryPrompt = `Summarize the following clinical note in 2–4 sentences, focusing on the client's current concerns, therapeutic focus, and progress. Use a different wording and structure than the original note. Do not copy sentences verbatim.\n\nClinical Note:\n${soapNote}`;

        const summaryResult = await model.generateContent(summaryPrompt);
        const summary = extractTextFromResponse(summaryResult);

        // Generate client instruction with a unique prompt to avoid repetition
        const instructionPrompt = `Write a follow-up message for the client after a therapy session, based on the clinical note below. Make sure the message is warm, professional, and supportive. Do not repeat sentences from the note. Instead, paraphrase and use a different structure. Avoid medical jargon and clinical labels.\n\nClinical Note:\n${soapNote}`;
        const instructionResult = await model.generateContent(instructionPrompt);
        const clientInstruction = extractTextFromResponse(instructionResult);

        const titlePrompt = `Create a title for the session after a therapy session, based on the clinical note below. Make sure the title does not exceed more than 8 words and it is easily understandable and identifieable for a therapist in first glance.\n\nClinical Note:\n${soapNote}`;
        const titleResult = await model.generateContent(titlePrompt);
        const title =  extractTextFromResponse(titleResult);

        note = await processGeminiResponse(note, soapNote, transcript, title, summary, clientInstruction);

        if (note.booking) {
            const booking = await bookingService.getBookingById(note.booking);
            if (!booking) {
                throw new Error("Booking not found");
            }
            await Booking.findByIdAndUpdate(note.booking, { status: "completed" }, { new: false });
        }
        await generateClientSummaryAndUpdateFromNote(note)
        return note;
    } catch (error) {
        const note = await Note.findByIdAndUpdate(noteId, {
            status: 'failed',
            failureReason: error.message,
        });
        if (note.booking) {
            const booking = await bookingService.getBookingById(note.booking);
            if (!booking) {
                throw new Error("Booking not found");
            }
            await Booking.findByIdAndUpdate(note.booking, { status: "completed" }, { new: false });
        }
        console.error('Error generating SOAP note:', error.message);
        return note;
    }
};

/**
 * Extract text from response (handles different model response formats)
 * @param {any} result - The generation result
 * @returns {string} - Extracted text
 */
function extractTextFromResponse(result) {
  try {
        let responseText;
        if (typeof result.response.text === 'function') {
          responseText = result.response.text();
        } else if (result.response.candidates && result.response.candidates[0]) {
          responseText = result.response.candidates[0].content.parts[0].text;
        } else {
          responseText = JSON.stringify(result.response);
        }
    if (responseText && responseText.length > 0) {
        return responseText;
    }
    
    // If all else fails, throw a helpful error
    throw new Error('Unable to extract text from response. Response format: ' + JSON.stringify(result.response).substring(0, 200));
    
  } catch (error) {
    console.error('Error extracting text from response:', error);
    throw error;
  }
}

const generateClientSummaryAndUpdateFromNote = async (note) => {
    try {
         const model = getModelWithInstructions(`You are a therapy progress summarization assistant.

Your task is to generate a clear, concise, professional **clinician-facing progress summary** of a client's therapy across sessions for the therapist to review before the client's next visit.

Focus on:
- Tracking the client's evolving concerns, therapeutic goals, and progress.
- Identifying patterns, improvements, setbacks, and key themes.
- Highlighting relevant symptoms, behavioral patterns, or psychosocial factors.
- Using professional, precise language, including appropriate clinical terminology where needed.
- Avoiding casual, warm, or direct address to the client.
- Presenting the information in a clear, structured narrative that the clinician can review quickly.

You will receive:
1. A summary of prior sessions.
2. A summary of the latest session.

Using these, generate a 3–5 sentence **clinician-facing progress summary** without copying sentences verbatim from the inputs. Focus on synthesizing the client's progress and current clinical focus to inform continued treatment planning.`);

        const clientData = await clientService.getClientById(note.client);
        if (!clientData) return;

        const oldHistoryPrompt = `You are a therapy progress summarization assistant.

Below is the client's prior progress summarized:
"""
${clientData.summary}
"""
`;

        const summaryGenPrompt = `Below is the summary from the latest session:
"""
${note.summary}
"""

Generate a **clinician-facing progress summary** in 3–5 sentences, focusing on:
- The client's evolving concerns, goals, and progress.
- Patterns, improvements, setbacks, and key themes.
- Relevant symptoms, behavioral patterns, or psychosocial factors.
- Using professional and precise language for therapist reference.
- Avoid direct address or casual encouragement.

Do not copy sentences verbatim. Synthesize and paraphrase, providing a clear overview for treatment planning.`;

        const promptText = clientData.summary ? oldHistoryPrompt + summaryGenPrompt : summaryGenPrompt;

        const result = await model.generateContent(promptText);
        const newSummary = extractTextFromResponse(result);

         return await Client.findByIdAndUpdate(note.client, { summary: newSummary }, { new: true });
    } catch (error) { 
        console.error("Failed to update client summary:", error);
        throw error;
    }
};

const processGeminiResponse = async (note, geminiResponse, transcript, title, summary, clientInstruction) => {
    try {
        if (!note || !geminiResponse) {
            throw new Error("Missing required parameters: noteId or geminiResponse");
        }
        // Updated regex patterns to extract the structured sections
        const subjectiveMatch = geminiResponse.match(/\*\*Subjective:\*\*\s*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const objectiveMatch = geminiResponse.match(/\*\*Objective:\*\*\s*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const assessmentMatch = geminiResponse.match(/\*\*Assessment:\*\*\s*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const planMatch = geminiResponse.match(/\*\*Plan:\*\*\s*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const instructionsMatch = geminiResponse.match(/\*\*Client Instruction Email:\*\*\s*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const visitTypeMatch = geminiResponse.match(/\*\*Visit type:\*\*\s*([\s\S]+?)(?=\n\n\*\*|$)/);
        
        // Remove "S: " and "O: " prefixes, trim whitespace
        const cleanText = (text) => text.replace(/^S:\s+|^O:\s+/i, "").replace(/\n+/g, " ").trim();

        // Extract text with fallback if data is missing
        const subjective = subjectiveMatch ? cleanText(subjectiveMatch[1]).replace(/^S:\s*/, '') : "No subjective data provided.";
        const objective = objectiveMatch ? cleanText(objectiveMatch[1]).replace(/^O:\s*/, '') : "No objective data provided.";
        const clientInstructions = instructionsMatch ? instructionsMatch[1].split('\n\n').map(email => email.trim()).join('\n\n') : "Follow the advocate’s advice and reach out for support when needed.";
        let assessment = assessmentMatch ? cleanText(assessmentMatch[1]).replace(/^A:\s*/, '') : "No assesment data provided.";
        let plan = planMatch ? cleanText(planMatch[1]).replace(/^P:\s*/, '') : "No plan data provided.";
        let visitType = visitTypeMatch ? cleanText(visitTypeMatch[1]) : "General Session";  

        const strippedResponse = geminiResponse
            .replace(/\*\*Title:\*\*\s*([\s\S]+?)(?=\n\n\*\*|$)/, '')
            .replace(/\*\*Visit type:\*\*\s*([\s\S]+?)(?=\n\n\*\*|$)/, '')
            .replace(/\*\*Client Instruction Email:\*\*\s*\n([\s\S]+)/, '');
    
        note.title = title ? title.replace(/^\s*\*+\s*/, '').replace(/\s*\*+\s*$/, '') : note.title;
        note.visitType = visitType
        note.subjective = subjective
        note.objective = objective
        note.assessment = assessment
        note.plan = plan
        note.clientInstructions = clientInstruction != '' && clientInstruction != undefined ? clientInstruction : clientInstructions
        note.status= "completed", // Mark note as completed
        note.sessionTranscript = transcript
        note.summary = summary
        note.outputContent = strippedResponse
        note.formattedContent = formatTherapyNoteToHTML(strippedResponse)
        note.originialOutputContent = geminiResponse
        note.originalSessionTranscript = transcript
        if (!note.noteType) {
            note.noteType = note.inputContentType
        }
        const updatedNote = await note.save();
        return updatedNote;
    } catch (error) {
        console.error("Error processing Gemini response:", error);
        throw new Error("Failed to process the response.");
    }
};

/**
 * Formats therapy note text into clean HTML for PDF generation and web view.
 *
 * Rules:
 * 1. Single * = bold
 * 2. Multiple * = heading with increasing size + bold
 * 3. Lines starting with "-" converted to bullet points
 */

function formatTherapyNoteToHTML(text) {
    // Replace literal \n if escaped
    text = text.replace(/\\n/g, '\n');

    const lines = text.split('\n');
    const htmlLines = [];

    for (let line of lines) {
        line = line.trim();
        if (line === '') continue;

        // Headings based on *
        const headingMatch = line.match(/^(\*+)(.*?)\1$/);
        if (headingMatch) {
            const stars = headingMatch[1].length;
            const content = headingMatch[2].trim();

            let tag = 'h3';
            if (stars >= 3) tag = 'h1';
            else if (stars === 2) tag = 'h2';

            htmlLines.push(`<${tag}>${content}</${tag}>`);
            continue;
        }

        // Bullet points for lines starting with '- '
        if (line.startsWith('- ')) {
            const content = line.slice(2).trim();
            htmlLines.push(`<p>&bull; ${content}</p>`);
            continue;
        }

        // Inline *bold* within text
        line = line.replace(/\*(.*?)\*/g, '<strong>$1</strong>');

        htmlLines.push(`<p>${line}</p>`);
    }

    // Return single-line HTML content without wrapper
    return htmlLines.join('').replace(/\n/g, '').replace(/\s\s+/g, ' ').trim();
}