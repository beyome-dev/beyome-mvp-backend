const config = require('../../config');
// const { GoogleGenerativeAI } = require("@google/generative-ai");


const mongoose = require('mongoose');
const bookingService = require("../booking.service");
const { Client, Booking, Note, Prompt } = require('../../models');

const { VertexAI } = require('@google-cloud/vertexai');

const WEBHOOK_URL = `${config.APP_URL}/api/webhook/salad`;
// const AI_MODEL = config.google.aiModel 
// const GEMINI_API_KEY = config.google.apiKey;
const PROJECT_ID =  config.google.projectID;
const LOCATION =  config.google.projectLocation || 'us-central1';

// Initialize VertexAI with credentials if available
const vertexAIOptions = {
  project: PROJECT_ID,
  location: LOCATION
};

// Use credentials file if configured (same as Google Cloud Storage)
if (config.googleCloudStorage?.credentialsPath) {
  vertexAIOptions.googleAuthOptions = {
    keyFilename: config.googleCloudStorage.credentialsPath
  };
}

// Initialize clients
const vertexAI = new VertexAI(vertexAIOptions);
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
 */
const generateNote = async (session, promptId, user) => {
    if (!session) {
        throw new Error("Session data is required to generate a note.");
    }
    if (!promptId) {
            throw new Error("Template ID is required.");
    }
        const transcript = session.recordings
            .filter(r => (r.recordingType === 'session_recording' || r.recordingType === 'dictation') && r.recordingId?.transcriptionText)
            .map(r => {
                const prefix = r.recordingType === 'session_recording' ? 'Session Recording: ' : 'Dictation: ';
                return prefix + r.recordingId.transcriptionText.trim();
            })
            .join('\n\n');

        if (!transcript || transcript.trim() === '') {
            throw new Error('No valid transcription or dictation recordings found for this session');
        }

    const template = await Prompt.findById(promptId);
    if (!template) {
        throw new Error("No prompt found");
    }

    let note = new Note({
        title: `Clinical Note for ${session.clientId.firstName} ${session.clientId.lastName}`,
        noteType: template.formatName,
        tags: ["soap", `${session.clientId.firstName} ${session.clientId.lastName}`],
        sessionId: session._id,
        user: user._id,
        client: session.clientId._id,
        organization: user.organization,
        prompt: template._id,
        version: 1,
        content: {
            subjective: "Generating...",
            objective: "Generating...",
            assessment: "Generating...",
            plan: "Generating...",
            data: "Generating...",
            analysis: "Generating...",
            customSections: [
        //         {
        //     label: String,
        //     content: String,
        //     order: Number
        // }
            ]
        },
        rawContent: "Generating...",
        formattedContent: "Generating...",
        status: "pending",
        generatedFromRecordings: session.recordings.map(rec => ({
            recordingId: rec.recordingId._id,
            recordingType: rec.recordingType,
            usedAt: new Date()
        })),

        // AI metadata
        //   aiGenerated: { type: Boolean, default: false },
        //   aiMetadata: {
        //     model: String,
        //     promptId: Schema.Types.ObjectId,
        //     generatedAt: Date,
        //     editedByUser: { type: Boolean, default: false },
        //     confidence: Number,
        //     tokensUsed: Number
        //   },
    });
        
        const promptText = `${template.promptText[0]}\n${transcript}`;

        
        const model = getModelWithInstructions(template.systemInstructions);

        // Generate SOAP note
        let result = await model.generateContent(promptText);
        const soapNote = extractTextFromResponse(result);

        // // Generate summary with a unique prompt to avoid repetition
        // const summaryPrompt = `Summarize the following clinical note in 2–4 sentences, focusing on the client's current concerns, therapeutic focus, and progress. Use a different wording and structure than the original note. Do not copy sentences verbatim.\n\nClinical Note:\n${soapNote}`;

        // const summaryResult = await model.generateContent(summaryPrompt);
        // const summary = extractTextFromResponse(summaryResult);

        // Generate client instruction with a unique prompt to avoid repetition
        const instructionPrompt = `Write a follow-up message for the client after a therapy session, based on the clinical note below. Make sure the message is warm, professional, and supportive. Do not repeat sentences from the note. Instead, paraphrase and use a different structure. Avoid medical jargon and clinical labels.\n\nClinical Note:\n${soapNote}`;
        const instructionResult = await model.generateContent(instructionPrompt);
        const clientInstruction = extractTextFromResponse(instructionResult);

        const titlePrompt = `Create a title for the session after a therapy session, based on the clinical note below. Make sure the title does not exceed more than 8 words and it is easily understandable and identifieable for a therapist in first glance.\n\nClinical Note:\n${soapNote}`;
        const titleResult = await model.generateContent(titlePrompt);
        const title =  extractTextFromResponse(titleResult);

        note = await processGeminiResponse(note, soapNote, transcript, title, clientInstruction);
        note.status = 'draft';
        if (note.booking) {
            const booking = await bookingService.getBookingById(note.booking);
            if (!booking) {
                throw new Error("Booking not found");
            }
            await Booking.findByIdAndUpdate(note.booking, { status: "completed" }, { new: false });
        }
        return note;
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
const generateSessionSummary = async (session) => {
    try {
    
        if (session.recordings.length == 0) {
            throw new Error("No recordings found for the session");
        }

        // Get all session recordings and their transcripts
        const recordings = session.recordings.map(r => ({
            type: r.recordingType,
            text: r.recordingId?.transcriptionText || ''
        })).filter(r => r.text);

        if (recordings.length === 0) {
            throw new Error('No transcripts available for summary generation');
        }

        // Separate session recordings and dictations
        const sessionTranscript = recordings
            .filter(r => r.type === 'session_recording')
            .map(r => r.text)
            .join('\n\n');

        const dictationTranscript = recordings
            .filter(r => r.type === 'dictation')
            .map(r => r.text)
            .join('\n\n');

        const model = getModelWithInstructions(`You are a clinical documentation assistant specialized in psychotherapy. 
            Your task is to generate session summaries for therapist review and reference. 
            These summaries help therapists quickly recall session content and prepare for upcoming appointments. 
            Maintain accuracy, avoid fabrication, and use only information present in the session transcript or clinical note.`);

        let promptText;
        if (sessionTranscript && dictationTranscript) {
            promptText = `Session Recording:\n${sessionTranscript}\n\nTherapist Dictation:\n${dictationTranscript}`;
        } else if (sessionTranscript) {
            promptText = `Session Recording:\n${sessionTranscript}`;
        } else {
            promptText = `Therapist Dictation:\n${dictationTranscript}`;
        }

        const titlePrompt = promptText + '\n\nYou are generating a single, concise session title based only on the transcript. Output exactly one title no longer than 10 words; it must be clear, specific, and meaningful, reflecting the primary topic, emotional tone, or therapeutic focus. Do not provide lists, alternatives, numbering, quotations, or explanations. If multiple themes appear, choose the most central.';
        let result = await model.generateContent(titlePrompt);
        const title = extractTextFromResponse(result);
        promptText += `\n\nGenerate a brief 2-3 sentence summary of this therapy session for the therapist\'s quick reference.
        
        Use a conversational, natural tone while remaining clinically accurate. Focus on:
            - Main topic or theme discussed
            - Key clinical observation or insight
            - What\'s planned for next session (if mentioned)
        Write as if you\'re reminding the therapist: \"Last time you talked about X, noticed Y, and planned to do Z.\"
        Keep it 50-75 words. Make it scannable and immediately useful.
            Rules:
            - Only use information from the transcript or clinical note
            - Be conversational but professional
            - No clinical jargon unless necessary
            - Focus on what matters most
            - 2-3 sentences maximum
            - No fabrication`;
        result = await model.generateContent(promptText);
        const summary = extractTextFromResponse(result);

        const longSummaryPrompt = promptText + `\n\nGenerate a detailed session summary in bullet point format for therapist review and preparation. Use clinical language and structure.
        
            Use the following sections (only include sections where information exists):
            *Main Topics Discussed:
            - List 3-5 key themes or topics covered in session
            - Be specific about content areas explored
            - Include important context mentioned
            *Key Insights & Observations:
            - Clinical observations about client's presentation
            - Patterns, dynamics, or mechanisms identified
            - Emotional or cognitive processes noted
            - Use clinical terminology appropriately
            *Therapeutic Interventions:
            - Specific techniques or modalities used (CBT, DBT, SFBT, etc.)
            - Interventions applied during session
            - Psychoeducation provided
            - Only include if interventions were used
            *Client Strengths Noted:
            - Protective factors observed
            - Coping skills demonstrated
            - Positive qualities or resources identified
            - Only include if discussed or observable
            *Risk/Safety Notes:
            - Any risk factors discussed (suicidal ideation, self-harm, etc.)
            - Safety planning if conducted
            - Crisis resources provided
            - Only include if risk was assessed
            *Homework/Between-Session Tasks:
            - Specific assignments given
            - Skills to practice
            - Behavioral experiments
            - Only include if homework was assigned
            *Plan for Next Session:
            - Topics to address
            - Goals to work toward
            - Follow-up on homework or previous discussions
            - Clinical approach to continue
            *Formatting:
            - Use bullet points for scannability
            - Keep bullets concise (1-2 lines each)
            - Use clinical language (intellectualization, rejection sensitivity, cognitive distortions, etc.)
            - Omit sections with no relevant content
            - Total length: fit on one screen (approximately 12-20 bullets across all sections)
            *Rules:
            - Only use information from the transcript or clinical note
            - Do not fabricate observations or interventions
            - Use standard clinical terminology
            - Be specific and actionable
            - No patient identifiers`;
        result = await model.generateContent(longSummaryPrompt);
        const longSummary = extractTextFromResponse(result);
        
        return { summary: summary, longSummary: longSummary, title: title }; ;
    } catch (error) { 
        console.error("Failed to update client summary:", error);
        throw error;
    }
};

const generateClientSummaryAndUpdateFromNote = async (session) => {
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

        const clientData = await Client.findById(session.clientId._id ? session.clientId._id : session.clientId);
        if (!clientData) return;

        const oldHistoryPrompt = `You are a therapy progress summarization assistant.

Below is the client's prior progress summarized:
"""
${clientData.summary}
"""
`;

        const summaryGenPrompt = `Below is the summary from the latest session:
"""
${session.summary}
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

        return await Client.findByIdAndUpdate(session.clientId, { summary: newSummary }, { new: true });
    } catch (error) { 
        console.error("Failed to update client summary:", error);
        throw error;
    }
};

const processGeminiResponse = async (note, geminiResponse, transcript, title, clientInstruction) => {
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
        note.rawContent = strippedResponse
        note.formattedContent = formatTherapyNoteToHTML(strippedResponse);
        note.content.subjective = subjective;
        note.content.objective = objective;
        note.content.assessment = assessment;
        note.content.plan = plan;
        return note;
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

module.exports = {
    generateNote,
    generateSessionSummary,
    generateClientSummaryAndUpdateFromNote,
    formatTherapyNoteToHTML,
};