const config = require('../config');
// const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const mongoose = require('mongoose');
const clientService = require('./client.service');
const bookingService = require("./booking.service");
const { Client, Booking, Note, Prompt } = require('../models');
const puppeteer = require('puppeteer');
const { VertexAI } = require('@google-cloud/vertexai');

const SALAD_API_URL = 'https://api.salad.com/api/public/organizations/beyome/inference-endpoints/transcribe/jobs';
const SALAD_API_KEY = config.salad.apiKey;
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

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}


const createNote = async(data) => {
    const note = new Note(data);
    return await note.save();
}

const getAllNotes = async(filter = {}, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
    const notes =  await Note.find(filter).select({ 
        "_id": 1,
        'summary': 1,
        "clientName": 1,
        "title": 1,
        "visitType": 1,
        "visitDate": 1,
        "subjective": 1,
        "objective": 1,
        "assessment": 1,
        "plan": 1,
        "inputContent": 1,
        "inputContentType": 1,
        "outputContent": 1,
        "sessionTranscript": 1,
        "clientInstructions": 1,
        "noteFormat": 1,
        "tags": 1,
        "status": 1,
        "saladJobId": 1,
        "userFeedback": 1,
        "originalSessionTranscript": 1,
        "originialOutputContent": 1,
        "formattedOutputContent": 1,
    })
    .sort({ visitDate: -1 })
    .skip(skip)
    .limit(limit);

    const totalCount = await Note.countDocuments(filter);

    return { 
        notes, 
        totalPages: Math.ceil(totalCount / limit), 
        currentPage: page, 
        totalCount 
    };
}

const getAllNotesMinimal = async (filter = {}, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
    const notes = await Note.find(filter, {
        "_id": 1,
        "clientName": 1,
        "title": 1,
        "visitType": 1,
        "visitDate": 1,
        "status": 1,
    })
    .sort({ visitDate: -1 })
    .skip(skip)
    .limit(limit);

    const totalCount = await Note.countDocuments(filter);

    return { 
        notes, 
        totalPages: Math.ceil(totalCount / limit), 
        currentPage: page, 
        totalCount 
    };
};

const getNoteById = async(noteId, user) => {
    const note = await Note.findById(noteId);
    if (!note) throw new Error('Note not found');
    if (note.user.toString() !== user._id.toString()) throw new Error('Not authorized');
    return note;
}

const updateNote = async(noteId, data, user) => {
    const note = await Note.findById(noteId);
    if (!note) throw new Error('Note not found');

    // Ensure only the user who created the note can edit
    if (note.user.toString() !== user._id.toString()) throw new Error('Not authorized');

    // Define fields that are allowed to be updated
    const allowedFields = [
        "title",
        'summary',
        'subjective',
        'objective',
        'assessment',
        'plan',
        'outputContent',
        'sessionTranscript',
        'clientInstructions',
        'tags',
        'userFeedback',
        'doctorFeedback',
    ];

    // Filter data to keep only allowed fields
    const filteredData = Object.keys(data).reduce((acc, key) => {
        if (allowedFields.includes(key)) acc[key] = data[key];
        return acc;
    }, {});

    // Prevent accidental overwrites of sensitive fields
    if (Object.keys(filteredData).length === 0) throw new Error('No valid fields to update');

    if (data.outputContent) {
        filteredData.formattedOutputContent = formatTherapyNoteToHTML(data.outputContent)
    }
    // Perform the update
    return await Note.findByIdAndUpdate(noteId, filteredData, { new: true });
}

const deleteNote = async(noteId, user) => {
    const note = await Note.findById(noteId);
    if (!note) throw new Error('Note not found');
    if (note.user.toString() !== user._id.toString()) throw new Error('Not authorized');
    const updateNote =  await Note.findByIdAndDelete(noteId);
    if (note.booking) {
        const booking = await bookingService.getBookingById(note.booking);
        if (!booking) {
            throw new Error("Booking status no updated");
        }
        await Booking.findByIdAndUpdate(note.booking, { status: "removed" }, { new: false });
    }
    return updateNote;
}

const saveAudio = async (file, query, user) => {
    try {
        let { client, booking, type, prompt } = query
        const filePath = path.join(uploadDir, file.filename);
        let fileUrl =`${config.APP_URL}/files/${file.filename}`;
        if (process.env.NODE_ENV === 'development') {
            fileUrl = `https://drive.google.com/uc?export=download&id=1aTdDS9oGf80MbG2kicOlEKqEcA_Do47i`
        }
        let visitDate = new Date();
        if (booking) {
            const bookingData = await bookingService.getBookingById(booking);
            if (!bookingData) {
                throw new Error("Booking not found");
            }
            if (bookingData.handler._id.toString() != user._id.toString()) {
                throw new Error("Not authorized to access this booking");
            }
            // Combine booking.date and booking.time (assumed format: "HH:mm")
            if (bookingData.date && bookingData.time) {
                // booking.date is a Date or ISO string, booking.time is "HH:mm"
                const datePart = new Date(bookingData.date);
                const [hours, minutes] = bookingData.time.split(':').map(Number);

                // Set IST time
                datePart.setHours(hours, minutes, 0, 0);

                // Convert IST to UTC (IST is UTC+5:30)
                // Subtract 5 hours and 30 minutes
                datePart.setMinutes(datePart.getMinutes() - 330);

                visitDate = new Date(datePart);
            } else {
                visitDate = bookingData.date ? new Date(bookingData.date) : new Date();
            }
            client = bookingData.client._id;
        } 
        let clientData =await clientService.getClientById(client);
        if (!clientData) {
            throw new Error("Client not found");
        }
        // Move file to uploads directory
        fs.renameSync(file.path, filePath);
        let promptFilter = { formatName: "SOAP", aiEngine: "Gemini" }
        if (typeof prompt === 'string' && prompt.trim() !== '') {
            promptFilter = { _id: mongoose.Types.ObjectId.createFromHexString(prompt) }
        }
        const promptData = await Prompt.findOne(promptFilter); 
        if (!promptData) throw new Error("Prompt data not found");
        let contentType = "Citation Note"
        if (type === "dictation") {
            contentType = "Dictation";
        } else if (req.query.type === "recording") {
            contentType = "Recording";
        }
        const note = new Note({
            title: `Clinical Note for ${clientData.firstName} ${clientData.lastName}`,
            visitType: "Follow up",
            visitDate: visitDate,
            summary: "Generating...",
            subjective: "Generating...",
            objective: "Generating...",
            inputContent: file.filename,
            outputContent: "Generating...",
            formattedOutputContent: "Generating...",
            sessionTranscript: "Generating...",
            clientInstructions: "Generating...",
            noteFormat: promptData.formatName,
            tags: ["soap", `${clientData.firstName} ${clientData.lastName}`],
            user: user._id,
            client: clientData._id,
            booking: booking,
            organization: user.organization,
            prompt: new mongoose.Types.ObjectId(promptData._id),
            status: "pending",
            assessment: 'Generating...',
            plan: 'Generating...',
            inputContentType: "audio",
            noteType: contentType,
        });
        const noteData = await note.save();

        if (booking) {
            await Booking.findByIdAndUpdate(booking, { dictationNote: noteData._id, status: "generating-note" }, { new: false });
        }
        // Call Salad API for transcription
        let transcriptResponse;
        try {
            transcriptResponse = await requestTranscription(fileUrl, noteData.id);
        } catch (transcriptError) {
            console.error("Error in transcription request:", transcriptError);
            transcriptResponse = null; // Ensure transcriptJobId is handled
        }

        const updatedNote = await Note.findByIdAndUpdate(
            noteData.id,
            { saladJobId: transcriptResponse?.id || null, status: "processing" },
            { new: true }
        );
        return {
            fileUrl,
            transcriptJobId: transcriptResponse?.id || null,
            note: updatedNote
        };
    } catch (error) {
        console.error('Error saving file:', error.message);
        throw error;
    }
};

const manualNoteGeneration = async (input, client, booking, type, prompt, user, io) => {
    try {
        let visitDate = new Date();
        if (booking) {
            const bookingData = await bookingService.getBookingById(booking);
            if (!bookingData) {
                throw new Error("Booking not found");
            }
            if (bookingData.handler._id.toString() != user._id.toString()) {
                throw new Error("Not authorized to access this booking");
            }
            // Combine booking.date and booking.time (assumed format: "HH:mm")
            if (bookingData.date && bookingData.time) {
                // booking.date is a Date or ISO string, booking.time is "HH:mm"
                const datePart = new Date(bookingData.date);
                const [hours, minutes] = bookingData.time.split(':').map(Number);

                // Set IST time
                datePart.setHours(hours, minutes, 0, 0);

                // Convert IST to UTC (IST is UTC+5:30)
                // Subtract 5 hours and 30 minutes
                datePart.setMinutes(datePart.getMinutes() - 330);

                visitDate = new Date(datePart);
            } else {
                visitDate = bookingData.date ? new Date(bookingData.date) : new Date();
            }
            client = bookingData.client._id;
        } 
        let clientData =await clientService.getClientById(client);
        if (!clientData) {
            throw new Error("Client not found");
        }
        let promptFilter = { formatName: "SOAP", aiEngine: "Gemini" }
        if (prompt != '' && prompt != undefined) {
            promptFilter = { _id: new mongoose.Types.ObjectId(prompt) }
        }
        const promptData = await Prompt.findOne(promptFilter); 
        if (!promptData) throw new Error("Prompt data not found");
        let contentType = "Citation Note"
        if (type === "dictation") {
            contentType = "Dictation";
        } else if (req.query.type === "recording") {
            contentType = "Recording";
        }
        const note = new Note({
            title: `Clinical Note for ${clientData.firstName} ${clientData.lastName}`,
            visitType: "Follow up",
            visitDate: visitDate,
            summary: "Generating...",
            subjective: "Generating...",
            objective: "Generating...",
            inputContent: input,
            outputContent: "Generating...",
            formattedOutputContent: "Generating...",
            sessionTranscript: input,
            clientInstructions: "Generating...",
            noteFormat: promptData.formatName,
            tags: ["soap", `${clientData.firstName} ${clientData.lastName}`],
            user: user._id,
            client: clientData._id,
            booking: booking,
            organization: user.organization,
            prompt: new mongoose.Types.ObjectId(promptData._id),
            status: "processing",
            assessment: 'Generating...',
            plan: 'Generating...',
            inputContentType: "text",
            noteType: contentType,
        });
        const updatedNote = await note.save();

        if (booking) {
            await Booking.findByIdAndUpdate(booking, { dictationNote: noteData._id, status: "generating-note" }, { new: false });
        }
        // Call Salad API for transcription
        generateSOAPNote(input, updatedNote._id, io);

        return {
            note: updatedNote
        };
    } catch (error) {
        console.error('Error saving file:', error.message);
        throw error;
    }
}

// Function to request transcription from Salad API
const requestTranscription = async (fileUrl, noteId) => {
    try {
       
        const response = await axios.post(
            SALAD_API_URL,
            {
                input: {
                    url: fileUrl,
                    return_as_file: false,
                    language_code: "en",
                    sentence_level_timestamps: false,
                    word_level_timestamps: false,
                    diarization: false,
                    sentence_diarization: true,
                    srt: false,
                    summarize: 0,
                    overall_sentiment_analysis: false

                },
                webhook: WEBHOOK_URL+`?id=${noteId}`
            },
            {
                headers: {
                    'Salad-Api-Key': SALAD_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('Salad API Error:', error.response?.data || error.message);
        throw new Error('Error requesting transcription');
    }
};


/**
 * Generates a SOAP note based on the provided transcript data.
 * @param {string} transcript - The transcript text from Salad.
 * @param {object} io - The Socket.io instance to emit the result.
 */
const generateSOAPNote = async (transcript, noteId, io) => {
    try {
        let note = await Note.findById(noteId);
        if (!note) {
            throw new Error("Note not found or failed to update.");
        }

        const prompt = await Prompt.findById(note.prompt);
        if (!prompt._id) {
            throw new Error("No prompt found");
        }
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
        note.formattedOutputContent = formatTherapyNoteToHTML(strippedResponse)
        note.originialOutputContent = geminiResponse
        note.originalSessionTranscript = transcript
        if (!note.noteType) {
            note.noteType = note.inputContentType
        }
        if (note.inputContent) {
            note.inputContent = note.sessionTranscript.length > 1000 ? 'audio' : 'text'
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

const extractSpeakerSentencesFromTimestamps = (payload) => {
    let speakerSentences = '';
    let currentSpeaker = ''
    payload.output.sentence_level_timestamps.forEach(sentence => {
      const { speaker, text } = sentence;
      if (currentSpeaker != speaker) {
        if (speaker) {
            currentSpeaker = speaker
        }
        speakerSentences += `\n ${currentSpeaker}: ${text}`
      } else {
        speakerSentences += ` ${text}`
      }
    });
  
    return speakerSentences;
};

/**
 * Generates a SOAP note based on the provided transcript data.
 * @param {string} transcript - The transcript text from Salad.
 * @param {object} io - The Socket.io instance to emit the result.
 */
const reprocessNote = async (noteId, params, io) => {
    try {
        let note = await Note.findById(noteId);
        if (!note) throw new Error('Note not found');

        if (note.inputContentType == 'text') {
            note = await generateSOAPNote(note.inputContent, note._id, io);
        } else {
            let transcript = note.sessionTranscript;
            if (!transcript) {
                if (!note.saladJobId) {
                    await Note.findByIdAndUpdate(note._id, { status: 'failed' });
                    throw new Error('No Salad Job ID found');
                }

                // Fetch job status from Salad API
                const response = await axios.get(`${SALAD_API_URL}${note.saladJobId}`, {
                    headers: { 'Salad-Api-Key': SALAD_API_KEY }
                });

                if (response.status === 200 && response.data.status === 'succeeded') {
                    if (response.data.output.error && response.data.output.error != '') {
                        throw new Error(response.data.output.error);
                    }
                    transcript = extractSpeakerSentencesFromTimestamps(response.data);
                } else {
                    throw new Error(`Transcription job status: ${response.data.status}`);
                }
            }
            note = await generateSOAPNote(transcript, note._id, io);
        }

        return note;

    } catch (error) {
        await Note.findByIdAndUpdate(noteId, { 
            status: 'failed',
            failureReason: error.message 
        });
        throw error;
    }
}



const generateTherapyNotePDF = async (noteId) => {
    const note = await Note.findById(noteId);
    if (!note) throw new Error('Note not found');
    const clientData = await clientService.getClientById(note.client);
    const createdAt = note.createdAt;
    const day = String(createdAt.getDate()).padStart(2, '0');
    const month = String(createdAt.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const year = createdAt.getFullYear();

    const formattedDate = `${day}-${month}-${year}`;
    const filename = clientData ? `${clientData.firstName}_${clientData.lastName}_therapy_note_${formattedDate}.pdf` : `therapy_note_${formattedDate}.pdf`;
    const filePath = path.join(__dirname, '..', 'temp', filename);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    // Wrap for PDF
    const fullHTML = wrapHTMLForPDF(note.formattedOutputContent);
    
    await generatePDF(fullHTML, filePath);

    return { filePath, filename };
};

function wrapHTMLForPDF(innerHTML) {
    return `
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 40px;
                    font-size: 14px;
                    line-height: 1.6;
                    color: #222;
                    position: relative;
                    box-sizing: border-box;
                }
                h1, h2, h3 {
                    font-weight: bold;
                    margin-top: 20px;
                    margin-bottom: 10px;
                }
                p { margin: 4px 0; }
                .footer-watermark {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    font-size: 10px;
                    color: #888;
                    display: flex;
                    align-items: center;
                    z-index: 1000;
                }
                .footer-watermark img {
                    height: 12px;
                    margin-left: 5px;
                }
            </style>
        </head>
        <body>
            ${innerHTML}
            <div class="footer-watermark">
                Powered by <img src="https://recapp.beyome.in/Recapp-Green.png" alt="Logo">
            </div>
        </body>
        </html>
    `.replace(/\n/g, '').replace(/\s\s+/g, ' ').trim();
}

/**
 * Generates a PDF file from provided HTML content.
 * 
 * @param {string} htmlContent - The HTML content to render.
 * @param {string} outputPath - The absolute or relative path where the PDF will be saved.
 * @param {Object} [options] - Optional configurations: { format, margin, printBackground }
 */
async function generatePDF(htmlContent, outputPath, options = {}) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // Basic styling to enhance PDF readability
        const styledHTML = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; font-size: 14px; line-height: 1.6; }
                    div { margin-bottom: 6px; }
                    .title { text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
                </style>
            </head>
            <body>${htmlContent}</body>
            </html>
        `;

        await page.setContent(styledHTML, { waitUntil: 'networkidle0' });

        await page.pdf({
            path: outputPath,
            format: options.format || 'A4',
            printBackground: options.printBackground ?? true,
            margin: options.margin || { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
        });

        console.log(`✅ PDF generated successfully at: ${path.resolve(outputPath)}`);
    } catch (error) {
        console.error('❌ Error generating PDF:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

module.exports = {
    createNote,
    getAllNotes,
    getNoteById,
    updateNote,
    deleteNote,
    saveAudio,
    generateSOAPNote,
    getAllNotesMinimal,
    reprocessNote,
    extractSpeakerSentencesFromTimestamps,
    generateTherapyNotePDF,
    manualNoteGeneration,
}