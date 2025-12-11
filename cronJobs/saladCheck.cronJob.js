const cron = require('node-cron');
const path = require('path');
const config = require('../config');
const { fetchTranscriptionStatus, requestTranscription } = require('../services/audioProcessing/transcribeAudio.service');
const { generateSessionSummary, generateClientSummaryAndUpdateFromNote } = require('../services/aiProcessing/noteGeneration');
const { Recording, Session  } = require('../models');
const { ensureLocalRecordingFile } = require('../services/storage/googleCloudStorage.service');


const FIVE_HOURS = 5 * 60 * 60 * 1000; 
const waitUntil = 45 * 60 * 1000;

// Schedule the cron job to run every 1 minute
const startCronJob = (io) => {
    cron.schedule('* * * * *', () => checkForSaladResults(io), {
        scheduled: true,
        timezone: 'UTC' // Adjust if needed
    });
};

const checkForSaladResults = async (io) => {
    
     // Fetch all recordings with status "Running" or with bookingId in bookingIds
    let runningRecordings = await Recording.find({ transcriptionStatus: 'processing',transcriptionMetadata: { $elemMatch: { provider: 'salad' } } });

    for (const recording of runningRecordings) {
        try {
            if (!recording.transcriptionMetadata) {
                throw error = new Error('No transcriptionMetadata found');
            }
            if (recording.transcriptionMetadata.provider === 'salad') {
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
            }
            if (recording.transcriptionStatus !== 'completed') {
                continue;
            }
            await Session.findByIdAndUpdate(recording.sessionId, { status: 'completed' });
            try {
                await createSessionSummary(recording);  
            } catch (error) {
                console.error(`Error generating summary for recording ${recording._id}:`, error.message);
            }
            io.to(recording.therapistId.toString()).emit('recordingTranscriptionCompleted', {
                recordingId: recording._id,
                transcriptionText: recording.transcriptionText,
                transcriptionMetadata: recording.transcriptionMetadata
            });
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
    const { summary, longSummary, title } = await generateSessionSummary(session)
    session.title = title;
    if (session.metadata) {
        session.metadata.summary = summary;
        session.metadata.longSummary = longSummary;
    } else {
        session.metadata = { summary, longSummary };
    }
    
    await session.save();
    await generateClientSummaryAndUpdateFromNote(session)
}

module.exports = startCronJob;