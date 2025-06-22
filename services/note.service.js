const config = require('../config');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const Note = require('../models/note');
const Prompt = require('../models/prompt');
const mongoose = require('mongoose');
const userService = require("./user.service");
const bookingService = require("./booking.service");
const Booking = require("../models/booking");

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
    const notes =  await Note.find(filter).select({ 
        "_id": 1,
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
        "clientName",
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
    if (note.user.toString() !== user._id.toString()) throw new Error('Not authorized');
    return await Note.findByIdAndDelete(noteId);
}

const saveAudio = async (file,clientID, bookingID, noteType, user) => {
    try {
        const filePath = path.join(uploadDir, file.filename);
        const fileUrl =`${config.APP_URL}/files/${file.filename}`;

        const client = await userService.getUserById(clientID);
        if (!client) {
            throw new Error("Client not found");
        }
        let visitDate = new Date();
        if (bookingID) {
            const booking = await bookingService.getBookingById(bookingID);
            if (!booking) {
                throw new Error("Booking not found");
            }
            if (booking.handler._id.toString() != user._id.toString()) {
                throw new Error("Not authorized to access this booking");
            }
            if (booking.client._id.toString() != client._id.toString()) {
                throw new Error("Booking does not belong to this client");
            }
            // Combine booking.date and booking.time (assumed format: "HH:mm")
            if (booking.date && booking.time) {
                // booking.date is a Date or ISO string, booking.time is "HH:mm"
                const datePart = new Date(booking.date);
                const [hours, minutes] = booking.time.split(':').map(Number);

                // Set IST time
                datePart.setHours(hours, minutes, 0, 0);

                // Convert IST to UTC (IST is UTC+5:30)
                // Subtract 5 hours and 30 minutes
                datePart.setMinutes(datePart.getMinutes() - 330);

                visitDate = new Date(datePart);
            } else {
                visitDate = booking.date ? new Date(booking.date) : new Date();
            }
        }
        // Move file to uploads directory
        fs.renameSync(file.path, filePath);

        const prompt = await Prompt.findOne({ aiEngine: "Gemini" }); 
        if (!prompt) throw new Error("Prompt data not found");
        let type = "Citation Note"
        if (noteType === "dictation") {
            type = "Dictation";
        } else if (req.query.type === "recording") {
            type = "Recording";
        } 
        const note = new Note({
            title: `Clinical Note for ${client.firstName} ${client.lastName}`,
            visitType: "Follow up",
            visitDate: new Date(),
            subjective: "nil",
            objective: "nil",
            inputContent: file.filename,
            outputContent: "nil",
            sessionTranscript: "nil",
            clientInstructions: "nil",
            noteFormat: "SOAP",
            tags: ["soap", `${client.firstName} ${client.lastName}`],
            user: user._id,
            client: client._id,
            booking: bookingID,
            organization: user.organization,
            prompt: new mongoose.Types.ObjectId(prompt._id),
            status: "pending",
            assessment: 'nil',
            plan: 'nil',
            inputContentType: type,
        });
        const noteData = await note.save();

        if (bookingID) {
            await Booking.findByIdAndUpdate(bookingID, { dictationNote: noteData._id, status: "generating-note" }, { new: false });
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
const generateSOAPNote = async (transcriptPayload, noteId, io) => {
    try {
        if (transcriptPayload.output.error && transcriptPayload.output.error != '') {
            throw new Error(transcriptPayload.output.error);
        }

        const transcript = extractSpeakerSentencesFromTimestamps(transcriptPayload);

        const prompt = await Prompt.findOne({aiEngine: "Gemini"})
        if (!prompt._id){
            throw new Error("No prompt found")
        }
        const promptText = `${prompt.promptText[0]}\n${transcript}`;


        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: AI_MODEL,
            systemInstruction: prompt.systemInstructions,
        });
        const result = await model.generateContent(promptText);

        const soapNote = result.response.text();
        // Emit the SOAP note to the frontend
        io.emit('soapNoteGenerated', { soapNote });

        const note = await processGeminiResponse(noteId, soapNote, transcript, transcriptPayload.output.summary)
        // if (note.inputContentType == "Recording" && config.deleteAudio){
        //     const filePath = path.join(uploadDir, note.inputContent);
        //     fs.unlink(filePath, (unlinkError) => {
        //         if (unlinkError) console.error('Failed to delete file:', unlinkError);
        //     });
        // }
        console.log("note booking :",note.booking)
        if (note.booking) {
            const booking = await bookingService.getBookingById(note.booking);
            if (!booking) {
                throw new Error("Booking not found");
            }
            await Booking.findByIdAndUpdate(note.booking, { status: "completed" }, { new: false });
        }
        return note;
    } catch (error) {
        const note = await Note.findByIdAndUpdate(noteId, { 
            status: 'failed',
            failureReason:  error.message,
        });
        console.log("note booking :",note.booking)
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

const processGeminiResponse = async (noteId, geminiResponse, transcript, summary) => {
    try {
        if (!noteId || !geminiResponse) {
            throw new Error("Missing required parameters: noteId or geminiResponse");
        }
        // Updated regex patterns to extract the structured sections
        const subjectiveMatch = geminiResponse.match(/\*\*Subjective:\*\*\s*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const objectiveMatch = geminiResponse.match(/\*\*Objective:\*\*\s*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const assessmentMatch = geminiResponse.match(/\*\*Assessment:\*\*\s*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const planMatch = geminiResponse.match(/\*\*Plan:\*\*\s*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const instructionsMatch = geminiResponse.match(/\*\*Client Instruction Email:\*\*\s*\n([\s\S]+?)(?=\n\n\*\*|$)/);
        const titleMatch = geminiResponse.match(/\*\*Title:\*\*\s*([\s\S]+?)(?=\n\n\*\*|$)/);
        const visitTypeMatch = geminiResponse.match(/\*\*Visit type:\*\*\s*([\s\S]+?)(?=\n\n\*\*|$)/);
        
        // Remove "S: " and "O: " prefixes, trim whitespace
        const cleanText = (text) => text.replace(/^S:\s+|^O:\s+/i, "").replace(/\n+/g, " ").trim();

        // Extract text with fallback if data is missing
        const subjective = subjectiveMatch ? cleanText(subjectiveMatch[1]).replace(/^S:\s*/, '') : "No subjective data provided.";
        const objective = objectiveMatch ? cleanText(objectiveMatch[1]).replace(/^O:\s*/, '') : "No objective data provided.";
        const clientInstructions = instructionsMatch ? instructionsMatch[1].split('\n\n').map(email => email.trim()).join('\n\n') : "Follow the advocate’s advice and reach out for support when needed.";
        let assessment = assessmentMatch ? cleanText(assessmentMatch[1]).replace(/^A:\s*/, '') : "No assesment data provided.";
        let plan = planMatch ? cleanText(planMatch[1]).replace(/^P:\s*/, '') : "No plan data provided.";
        let title = titleMatch ? cleanText(titleMatch[1]) : 'Clinical Note';
        let visitType = visitTypeMatch ? cleanText(visitTypeMatch[1]) : "General Session";  

        const strippedResponse = geminiResponse
            .replace(/\*\*Title:\*\*\s*([\s\S]+?)(?=\n\n\*\*|$)/, '')
            .replace(/\*\*Visit type:\*\*\s*([\s\S]+?)(?=\n\n\*\*|$)/, '')
            .replace(/\*\*Client Instruction Email:\*\*\s*\n([\s\S]+)/, '');
    
        // Update the note in the database
        const note = await Note.findById(noteId) 
        if (!note) {
            throw new Error("Note not found or failed to update.");
        }
        note.title = title
        note.visitType = visitType
        note.subjective = subjective
        note.objective = objective
        note.assessment = assessment
        note.plan = plan
        note.clientInstructions = clientInstructions
        note.status= "completed", // Mark note as completed
        note.sessionTranscript = transcript
        note.summary = summary
        note.outputContent = strippedResponse
        note.originialOutputContent = geminiResponse
        note.originalSessionTranscript = transcript
        const updatedNote = await note.save();
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

/**
 * Generates a SOAP note based on the provided transcript data.
 * @param {string} transcript - The transcript text from Salad.
 * @param {object} io - The Socket.io instance to emit the result.
 */
const reprocessNote = async (noteId, io) => {
    try {
        let note = await Note.findById(noteId);
        if (!note) throw new Error('Note not found');

        if (!note.saladJobId) {
            await Note.findByIdAndUpdate(note._id, { status: 'failed' });
            throw new Error("No Salad Job ID found")
        }
        const response = await axios.get(`${SALAD_API_URL}/${note.saladJobId}`, {
            headers: { 'Salad-Api-Key': SALAD_API_KEY }
        });
        if (response.status === 200 && response.data.status === 'succeeded') {
            // Call service function with socket.io instance
            note = await generateSOAPNote(response.data, note._id, io);
            return note;
        } else {
            throw new Error(`Error fetching job status from salad: ${response.data.status}`);
        }
    } catch (error) {
        throw new Error(`Error fetching job status: ${error.message}`);
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
}