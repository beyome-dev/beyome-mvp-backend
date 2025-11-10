const cron = require('node-cron');
const axios = require('axios');
const mongoose = require('mongoose');
const config = require('../config');
const { fetchTranscriptionStatus } = require('../services/audioProcessing/transcribeAudio.service');
const { generateSessionSummary, generateClientSummaryAndUpdateFromNote } = require('../services/aiProcessing/noteGeneration');
const { Recording, Session  } = require('../models');


const FIVE_HOURS = 5 * 60 * 60 * 1000; 

// /**
//  * Function to fetch and process running jobs.
//  */
// const processRunningJobs = async (io) => {
//     try {
//         console.log('Running cron job to process notes...');


//         const bookings = await Booking.find({ status: 'generating-note' })

//         let bookingIds = bookings.map(booking => booking._id);
//         // Fetch all notes with status "Running" or with bookingId in bookingIds
//         let runningNotes = await Note.find({
//             $or: [
//             { status: 'processing' },
//             { booking: { $in: bookingIds } }
//             ]
//         });

//         if (runningNotes.length === 0) {
//             return;
//         }

//         const currentTime = new Date();
//         for (const note of runningNotes) {
//             // Check if note is older than 5 hours
//             const createdAt = new Date(note.createdAt);
//             if (currentTime - createdAt > FIVE_HOURS) {
//                 console.warn(`Note ${note._id} exceeded 5 hours. Marking as Failed.`);
//                 await Note.findByIdAndUpdate(note._id, { status: 'failed' });
//                 continue;
//             }
//             if (note.inputContentType == 'text') {
//                 await noteService.generateNote(note.inputContent, note._id, io);
//             } else {
//                 try {
//                     let transcript = note.sessionTranscript
//                     if (!transcript || transcript.trim() === "" || transcript.trim() === 'Generating...') {
//                         if (!note.saladJobId) {
//                             await Note.findByIdAndUpdate(note._id, { status: 'failed' });
//                             console.warn(`Skipping note ${note._id} - No Salad Job ID found.`);
//                             continue;
//                         }
//                         // Fetch job status from Salad API
//                         const response = await axios.get(`${SALAD_API_URL}${note.saladJobId}`, {
//                         headers: { 'Salad-Api-Key': SALAD_API_KEY }
//                         });
//                         if (response.status === 200 && response.data.status === 'succeeded') {
//                             console.log(`Job ${note.saladJobId} succeeded, processing SOAP note...`);
//                             if (response.data.output.error && response.data.output.error != '') {
//                                 throw new Error(response.data.output.error);
//                             }
//                             transcript = await noteService.extractSpeakerSentencesFromTimestamps(response.data);
//                             // Call service function with socket.io instance
//                             await noteService.generateNote(transcript, note._id, io);
//                         } else {
//                             console.log(`Job ${note.saladJobId} status: ${response.data.status}`);
//                             continue;
//                         }
//                     } else {
//                         await noteService.generateNote(transcript, note._id, io);
//                     }
//                 } catch (error) {
//                     console.error(`Error fetching job ${note.saladJobId}:`, error.message);
//                 }
//             }
//         }
//     } catch (error) {
//         console.error('Error processing running jobs:', error.message);
//     }
// };

// Schedule the cron job to run every 1 minute
const startCronJob = (io) => {
    cron.schedule('* * * * *', () => checkForSaladResults(io), {
        scheduled: true,
        timezone: 'UTC' // Adjust if needed
    });
};

const checkForSaladResults = async (io) => {
    
     // Fetch all recordings with status "Running" or with bookingId in bookingIds
    let runningRecordings = await Recording.find({ transcriptionStatus: 'processing', provider: 'salad' });

    for (const recording of runningRecordings) {
        try {
            if (!recording.transcriptionMetadata?.jobId) {
                throw error = new Error('No Salad Job ID found in transcriptionMetadata');
            }
            // Fetch job status from Salad API
            const transcriptionResult = await fetchTranscriptionStatus(recording.transcriptionMetadata.jobId);
            if (transcriptionResult.transcriptionStatus === 'processing') {
                console.log(`Job ${recording.transcriptionMetadata.jobId} still processing...`);
                continue;
            }
            // Update recording with transcription
            recording.transcriptionText = transcriptionResult.transcriptionText;
            recording.transcriptionStatus = transcriptionResult.transcriptionStatus;
            recording.transcriptionMetadata = transcriptionResult.transcriptionMetadata
            await recording.save();
            try {
                await createSessionSummary(recording);  
            } catch (error) {
                console.error(`Error generating summary for recording ${recording._id}:`, error.message);
            }
        } catch (error) {
            await Recording.findByIdAndUpdate(recording._id, { 
                transcriptionStatus: 'failed',
                transcriptionError: {
                    message: error.message,
                    code: 'SALAD_API_ERROR',
                    timestamp: new Date()
                }
            });
        }
    }
}

const createSessionSummary = async (recording) => {
    const session = await Session.findById(recording.sessionId)
        .populate("clientId")
        .populate("recordings.recordingId");
    if (!session) {
        throw new Error('Session not found for summary generation');
    }
    const { summary, title } = await generateSessionSummary(session)
    session.title = title;
    if (session.metadata) {
       session.metadata.summary = summary;
    } else {
         session.metadata = { summary };
    }
    
    await session.save();
    await generateClientSummaryAndUpdateFromNote(session)
}

module.exports = startCronJob;