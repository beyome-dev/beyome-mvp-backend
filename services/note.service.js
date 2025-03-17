const config = require('../config');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const Note = require('../models/note');
const Prompt = require('../models/prompt');
const mongoose = require('mongoose');

const SALAD_API_URL = 'https://api.salad.com/api/public/organizations/beyome/inference-endpoints/transcribe/jobs';
const SALAD_API_KEY = config.salad.apiKey;
const WEBHOOK_URL = `${config.APP_URL}/api/webhook/salad`;
const AI_MODEL = config.google.aiModel 
const GEMINI_API_KEY = config.google.apiKey 
const uploadDir = path.join(__dirname, '../uploads');

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
    return await Note.find(filter).select({ 
        "_id": 1,
        "patientName": 1,
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
        "patientInstructions": 1,
        "noteFormat": 1,
        "tags": 1,
        "status": 1,
        "saladJobId": 1
    })
    .sort({ visitDate: -1 })
    .skip(skip)
    .limit(limit);
}

const getAllNotesMinimal = async (filter = {}, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
    const notes = await Note.find(filter, {
        "_id": 1,
        "patientName": 1,
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
    if (note.doctor.toString() !== user._id.toString()) throw new Error('Not authorized');
    return note;
}

const updateNote = async(noteId, data, user) => {
    const note = await Note.findById(noteId);
    if (!note) throw new Error('Note not found');

    // Ensure only the doctor who created the note can edit
    if (note.doctor.toString() !== user._id.toString()) throw new Error('Not authorized');

    // Define fields that are allowed to be updated
    const allowedFields = [
        "title",
        "patientName",
        'summary',
        'subjective',
        'objective',
        'assessment',
        'plan',
        'outputContentUpdated',
        'sessionTranscriptUpdated',
        'patientInstructions',
        'tags',
    ];

    // Filter data to keep only allowed fields
    const filteredData = Object.keys(data).reduce((acc, key) => {
        if (allowedFields.includes(key)) acc[key] = data[key];
        return acc;
    }, {});

    // Prevent accidental overwrites of sensitive fields
    if (Object.keys(filteredData).length === 0) throw new Error('No valid fields to update');

    // Perform the update
    return await Note.findByIdAndUpdate(noteId, filteredData, { new: true });
}

const deleteNote = async(noteId, user) => {
    const note = await Note.findById(noteId);
    if (!note) throw new Error('Note not found');
    if (note.doctor.toString() !== user._id.toString()) throw new Error('Not authorized');
    return await Note.findByIdAndDelete(noteId);
}

const saveAudio = async (file,patientName, user) => {
    try {
        const filePath = path.join(uploadDir, file.filename);
        const fileUrl = `${config.APP_URL}/files/${file.filename}`;

        // Move file to uploads directory
        fs.renameSync(file.path, filePath);

        const prompt = await Prompt.findOne({ aiEngine: "Gemini" }); // Use findOne() to avoid array issues
        if (!prompt) throw new Error("Prompt data not found");

        const note = new Note({
            patientName,
            title: `Clinical Note for ${patientName}`,
            visitType: "Follow up",
            visitDate: new Date(),
            subjective: "nil",
            objective: "nil",
            inputContent: file.filename,
            inputContentType: "Recording",
            outputContent: "nil",
            sessionTranscript: "nil",
            patientInstructions: "nil",
            noteFormat: "SOAP",
            tags: ["soap", patientName],
            doctor: new mongoose.Types.ObjectId(user._id),
            prompt: new mongoose.Types.ObjectId(prompt._id),
            status: "pending",
            assessment: [],
            plan: []
        });

        const noteData = await note.save();

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
        throw new Error('Error saving file');
    }
};

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
                    sentence_level_timestamps: true,
                    word_level_timestamps: false,
                    diarization: false,
                    sentence_diarization: true,
                    srt: false,
                    summarize: 100,
                    overall_sentiment_analysis: true

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
const generateSOAPNote = async (transcriptPayload, noteId, io) => {
    try {
        if (transcriptPayload.output.error && transcriptPayload.output.error != '') {
            const note = await Note.findByIdAndUpdate(noteId, { 
                status: 'failed',
                failureReason: transcriptPayload.output.error,
            });
            return note
        }

        const transcript = extractSpeakerSentencesFromTimestamps(transcriptPayload);

        const prompt = await Prompt.findOne({aiEngine: "Gemini"})
        if (!prompt._id){
            throw new Error("No prompt found")
        }
        const promptText = `${prompt.promptText}\n${transcript}`;


        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: AI_MODEL,
            systemInstruction: `You are a highly skilled medical scribe with a deep understanding of medical terminology and clinical documentation. Your task is to create a medically accurate and comprehensive SOAP note from the following doctor-patient transcript.
*General Instructions:*

•⁠  ⁠*Prioritize Medical Accuracy:* In cases of ambiguity, prioritize clinically accepted medical terminology and practices.
•⁠  ⁠*Use Standard Medical Abbreviations:* Employ only widely recognized and accepted medical abbreviations.
•⁠  ⁠*Clarify Ambiguities:* If the transcript is unclear, attempt to infer the most likely medical meaning based on context. If inference is impossible, clearly indicate the ambiguity within the SOAP note.
•⁠  ⁠*Maintain Professional Tone:* The SOAP note should reflect a professional and objective medical record.
•⁠  ⁠*Do not fabricate information:* If the information is not present in the transcript, do not add it.
•⁠  ⁠*If a test, medication, or diagnosis is mentioned, but not explained, include it in the note.*`,
        });
        const result = await model.generateContent(promptText);

        const soapNote = result.response.text();
        // Emit the SOAP note to the frontend
        io.emit('soapNoteGenerated', { soapNote });

        const note = await processGeminiResponse(noteId, soapNote, transcript, transcriptPayload.output.summary)
        if (note.inputContentType == "Recording") {
            const filePath = path.join(uploadDir, note.inputContent);
            fs.unlink(filePath, (unlinkError) => {
                if (unlinkError) console.error('Failed to delete file:', unlinkError);
            });
        }
        return note;
    } catch (error) {
        console.error('Error generating SOAP note:', error.message);
        throw new Error('Failed to generate SOAP note');
    }
};

const processGeminiResponse = async (noteId, geminiResponse, transcript, summary) => {
    try {
        if (!noteId || !geminiResponse) {
            throw new Error("Missing required parameters: noteId or geminiResponse");
        }
        // Updated regex patterns to extract the structured sections
        const subjectiveMatch = geminiResponse.match(/\*\*Subjective:\*\*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const objectiveMatch = geminiResponse.match(/\*\*Objective:\*\*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const assessmentMatch = geminiResponse.match(/\*\*Assessment:\*\*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const planMatch = geminiResponse.match(/\*\*Plan:\*\*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const instructionsMatch = geminiResponse.match(/\*\*Patient Instructions:\*\*\n([\s\S]+)/);

        // Remove "S: " and "O: " prefixes, trim whitespace
        const cleanText = (text) => text.replace(/^S:\s+|^O:\s+/i, "").trim();

        // Extract text with fallback if data is missing
        const subjective = subjectiveMatch ? cleanText(subjectiveMatch[1]).replace(/^S:\s*/, '') : "No subjective data provided.";
        const objective = objectiveMatch ? cleanText(objectiveMatch[1]).replace(/^O:\s*/, '') : "No objective data provided.";
        const patientInstructions = instructionsMatch ? instructionsMatch[1].trim() : "No patient instructions provided.";

        // Extract assessment section (handles bullet points and ** formatting)
        let assessment = [];
        if (assessmentMatch) {
            assessment = assessmentMatch[1]
                .split("\n")
                .map(line => line.trim().replace(/^•\s*/, "")) // Remove bullet points
                .filter(line => line)
                .map(line => {
                    const parts = line.replace(/\*\*/g, "").split(/:(.+)/); // Remove extra '**' and split title & description
                    return {
                        title: parts[0].trim(),
                        description: parts[1] ? parts[1].trim() : ""
                    };
                });
        }

        // Extract plan section with properly separated steps
        // Extract plan dynamically (handles bullet points)
        let plan = [];
        if (planMatch) {
            const planLines = planMatch[1]
                .split("\n")
                .map(line => line.trim())
                .filter(line => line.startsWith("•"));

            plan = planLines.map(line => {
                const parts = line.replace(/\*\*/g, "").split(/:(.+)/); // Remove extra '**' and split title & description
                return {
                    title:  parts[0].replace(/[*•\t:]/g, '').trim(),
                    steps: [parts[1] ? parts[1].trim() : ""] // Placeholder for expansion if needed
                }
            });
        }
        // if (planMatch) {
        //     plan = planMatch[1]
        //         .split("\n")
        //         .map(line => line.trim())
        //         .filter(line => line.startsWith("**")) // Identify titles
        //         .map((titleLine, index, arr) => {
        //             const title = titleLine.replace(/\*\*/g, "").replace(/:$/, "").trim(); // Remove '**' and trailing ':'
        //             const nextIndex = arr[index + 1] ? geminiResponse.indexOf(arr[index + 1]) : geminiResponse.length;
        //             const currentIndex = geminiResponse.indexOf(titleLine);
        //             const stepsRaw = geminiResponse.substring(currentIndex + titleLine.length, nextIndex).trim();
                    
        //             // Extract steps by splitting on periods ('.')
        //             const steps = stepsRaw
        //                 .split(".")
        //                 .map(step => step.trim())
        //                 .filter(step => step.length > 0);

        //             return { title, steps };
        //         });
        // }
        
        // Update the note in the database
        const updatedNote = await Note.findByIdAndUpdate(noteId, {
            subjective,
            objective,
            assessment,
            plan,
            patientInstructions,
            status: "completed", // Mark note as completed
            sessionTranscript: transcript,
            summary: summary,
            outputContent: geminiResponse
        }, { new: true });
        if (!updatedNote) {
            throw new Error("Note not found or failed to update.");
        }
        return updatedNote;
    } catch (error) {
        console.error("Error processing Gemini response:", error);
        throw new Error("Failed to process the response.");
    }
};

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

module.exports = {
    createNote,
    getAllNotes,
    getNoteById,
    updateNote,
    deleteNote,
    saveAudio,
    generateSOAPNote,
    getAllNotesMinimal,
}