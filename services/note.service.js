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
        "formattedContent": 1,
        "noteType": 1,
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
        "noteType": 1,
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
    if (note.user.toString() !== user._id.toString() && user.userType != 'platform_admin') throw new Error('Not authorized');
    return note;
}

const updateNote = async(noteId, data, user) => {
    let note = await Note.findById(noteId);
    if (!note) throw new Error('Note not found');

    // Ensure only the user who created the note can edit
    if (note.user.toString() !== user._id.toString() && user.userType != 'platform_admin') throw new Error('Not authorized');

    let noteDataTobeUpdated = data
    if (user.userType != 'platform_admin') {
         // Define fields that are allowed to be updated
        const allowedFields = [
            'title',
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
            "prompt"
        ];
        // Filter data to keep only allowed fields
        noteDataTobeUpdated = Object.keys(data).reduce((acc, key) => {
            if (allowedFields.includes(key)) acc[key] = data[key];
            return acc;
        }, {});
    }

    if (data.outputContent) {
        noteDataTobeUpdated.formattedContent = formatTherapyNoteToHTML(data.outputContent)
    }
    
    // Prevent accidental overwrites of sensitive fields
    if (Object.keys(noteDataTobeUpdated).length === 0) throw new Error('No valid fields to update');

    // Perform the update
    return await Note.findByIdAndUpdate(noteId, noteDataTobeUpdated, { new: true });
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
            formattedContent: "Generating...",
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

const manualNoteGeneration = async (input, client, session, booking, type, prompt, user, io) => {
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
        if (session) {
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
            formattedContent: "Generating...",
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
            note = await generateSOAPNote(note.inputContent, note._id, io, params.prompt);
        } else {
            let transcript = note.sessionTranscript;
            if (!transcript || transcript.trim() === "" || transcript.trim() === 'Generating...') {
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
                    // note = await generateSOAPNote(transcript, note._id, io, params.prompt);
                } else {
                    throw new Error(`Transcription job status: ${response.data.status}`);
                }
            } else {
                 note = await generateSOAPNote(transcript, note._id, io, params.prompt);
            }
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
    const fullHTML = wrapHTMLForPDF(note.formattedContent);
    
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

generateNoteForSession = async (sessionTranscript, noteId, io) => {
    
}

module.exports = {
    createNote,
    getAllNotes,
    getNoteById,
    updateNote,
    deleteNote,
    saveAudio,
    getAllNotesMinimal,
    reprocessNote,
    generateTherapyNotePDF,
    manualNoteGeneration,
}