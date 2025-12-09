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
const PROJECT_ID =  config.google.projectID;
const LOCATION =  config.google.projectLocation || 'us-central1';


// Initialize clients
const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
// const model = vertexAI.getGenerativeModel({ model: 'gemini-1.5-flash' });


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
        "tags": 1,
        "status": 1,
        "rawContent": 1,
        "formattedContent": 1,
        "noteType": 1,
        "content": 1,
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

/**
 * Helper function to format structured content object into HTML
 */
function formatStructuredContentToHTML(content, noteType = 'SOAP') {
    const htmlLines = [];
    
    if (noteType === 'SOAP' || !noteType) {
        if (content.subjective) {
            htmlLines.push('<h2>**Subjective:**</h2>');
            htmlLines.push(`<p>${content.subjective.replace(/\n/g, '<br>')}</p>`);
        }
        if (content.objective) {
            htmlLines.push('<h2>**Objective:**</h2>');
            htmlLines.push(`<p>${content.objective.replace(/\n/g, '<br>')}</p>`);
        }
        if (content.assessment) {
            htmlLines.push('<h2>**Assessment:**</h2>');
            htmlLines.push(`<p>${content.assessment.replace(/\n/g, '<br>')}</p>`);
        }
        if (content.plan) {
            htmlLines.push('<h2>**Plan:**</h2>');
            htmlLines.push(`<p>${content.plan.replace(/\n/g, '<br>')}</p>`);
        }
    } else if (noteType === 'DAP') {
        if (content.data) {
            htmlLines.push('<h2>**Data:**</h2>');
            htmlLines.push(`<p>${content.data.replace(/\n/g, '<br>')}</p>`);
        }
        if (content.analysis) {
            htmlLines.push('<h2>**Analysis:**</h2>');
            htmlLines.push(`<p>${content.analysis.replace(/\n/g, '<br>')}</p>`);
        }
        if (content.plan) {
            htmlLines.push('<h2>**Plan:**</h2>');
            htmlLines.push(`<p>${content.plan.replace(/\n/g, '<br>')}</p>`);
        }
    }
    
    // Handle custom sections
    if (content.customSections && Array.isArray(content.customSections)) {
        const sortedSections = [...content.customSections].sort((a, b) => (a.order || 0) - (b.order || 0));
        sortedSections.forEach(section => {
            if (section.label && section.content) {
                htmlLines.push(`<h2>**${section.label}:**</h2>`);
                htmlLines.push(`<p>${section.content.replace(/\n/g, '<br>')}</p>`);
            }
        });
    }
    
    return htmlLines.join('');
}

/**
 * Helper function to format raw text content into HTML (simplified version)
 */
function formatRawContentToHTML(text) {
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

const updateNote = async(noteId, data, user) => {
    let note = await Note.findById(noteId);
    if (!note) throw new Error('Note not found');

    // Ensure only the user who created the note can edit
    if (note.user.toString() !== user._id.toString() && user.userType != 'platform_admin') throw new Error('Not authorized');

    // Preserve original generated content on first edit (if not already preserved)
    // Only preserve if content exists and is not a placeholder
    const isPlaceholder = (text) => !text || text.trim() === '' || text === 'Generating...';
    const hasValidContent = note.content && (
        !isPlaceholder(note.content.subjective) ||
        !isPlaceholder(note.content.objective) ||
        !isPlaceholder(note.content.assessment) ||
        !isPlaceholder(note.content.plan)
    );
    const hasValidRawContent = note.rawContent && !isPlaceholder(note.rawContent);
    const hasValidFormattedContent = note.formattedContent && !isPlaceholder(note.formattedContent);
    
    if (!note.originalGeneratedContent && (hasValidContent || hasValidRawContent || hasValidFormattedContent)) {
        note.originalGeneratedContent = {
            content: note.content ? JSON.parse(JSON.stringify(note.content)) : null,
            formattedContent: hasValidFormattedContent ? note.formattedContent : null,
            rawContent: hasValidRawContent ? note.rawContent : null
        };
        await note.save();
    }

    let noteDataTobeUpdated = {};
    
    if (user.userType != 'platform_admin') {
        // Define fields that are allowed to be updated
        const allowedTopLevelFields = [
            'title',
            'tags',
            'prompt',
            'status',
            'rawContent',
            'formattedContent',
            'content'
        ];
        
        // Filter top-level fields
        Object.keys(data).forEach(key => {
            if (allowedTopLevelFields.includes(key)) {
                noteDataTobeUpdated[key] = data[key];
            }
        });
    } else {
        // Admin can update any field
        noteDataTobeUpdated = { ...data };
    }

    // Handle content updates (new structure)
    // Check if any content fields are being updated (either as nested object or individual fields)
    const contentFields = ['subjective', 'objective', 'assessment', 'plan', 'data', 'analysis', 'customSections'];
    const contentToProcess = noteDataTobeUpdated.content || data.content;
    const hasContentUpdates = contentToProcess && typeof contentToProcess === 'object';
    const hasIndividualContentUpdates = contentFields.some(field => 
        data[`content.${field}`] !== undefined || data[field] !== undefined
    );
    
    if (hasContentUpdates || hasIndividualContentUpdates) {
        // Get existing content or initialize empty object
        const existingContent = note.content ? JSON.parse(JSON.stringify(note.content)) : {};
        
        // Merge content updates
        if (hasContentUpdates) {
            // Full content object provided
            Object.assign(existingContent, contentToProcess);
        } else {
            // Individual content fields provided (either as content.field or just field)
            contentFields.forEach(field => {
                if (data[`content.${field}`] !== undefined) {
                    existingContent[field] = data[`content.${field}`];
                } else if (data[field] !== undefined) {
                    existingContent[field] = data[field];
                }
            });
        }
        
        // Update content in noteDataTobeUpdated
        noteDataTobeUpdated.content = existingContent;
        
        // Regenerate formattedContent when content is updated (unless explicitly provided)
        if (!noteDataTobeUpdated.formattedContent) {
            noteDataTobeUpdated.formattedContent = formatStructuredContentToHTML(
                existingContent, 
                note.noteType || 'SOAP'
            );
        }
        
        // Mark that user has edited - will handle this separately in update
    }

    // Handle rawContent updates
    if (data.rawContent !== undefined) {
        noteDataTobeUpdated.rawContent = data.rawContent;
        // If formattedContent is not explicitly provided, generate it from rawContent
        if (!data.formattedContent && data.rawContent) {
            noteDataTobeUpdated.formattedContent = formatRawContentToHTML(data.rawContent);
        }
    }

    // Handle direct formattedContent updates
    if (data.formattedContent !== undefined) {
        noteDataTobeUpdated.formattedContent = data.formattedContent;
    }
    
    // Prevent accidental overwrites of sensitive fields
    if (Object.keys(noteDataTobeUpdated).length === 0) throw new Error('No valid fields to update');

    // Build update object with proper nested field handling
    const updateObj = { $set: {} };
    
    // Handle nested content update separately
    const contentNeedsUpdate = noteDataTobeUpdated.content !== undefined;
    if (contentNeedsUpdate) {
        updateObj.$set.content = noteDataTobeUpdated.content;
        // Also mark that user has edited
        updateObj.$set['aiMetadata.editedByUser'] = true;
        delete noteDataTobeUpdated.content;
    }
    
    // Add all other fields to $set
    Object.keys(noteDataTobeUpdated).forEach(key => {
        updateObj.$set[key] = noteDataTobeUpdated[key];
    });

    // Perform the update
    const updatedNote = await Note.findByIdAndUpdate(
        noteId, 
        updateObj, 
        { new: true }
    );
    
    return updatedNote;
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
            transcriptResponse = await requestTranscription(file, noteData.id, { languageCode: 'auto' });
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
        generateNote(input, updatedNote._id, io);

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
            note = await generateNote(note.inputContent, note._id, io, params.prompt);
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
                    // note = await generateNote(transcript, note._id, io, params.prompt);
                } else {
                    throw new Error(`Transcription job status: ${response.data.status}`);
                }
            } else {
                 note = await generateNote(transcript, note._id, io, params.prompt);
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