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

    let oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let failedRecordings = await Recording.find({ 
        transcriptionStatus: 'failed',
        createdAt: { $gte: oneDayAgo } 
    });
    for (const recording of failedRecordings) {
        try {
            // Skip if already tried with Salad
            if (recording.transcriptionMetadata?.provider === 'salad') {
                continue;
            }
            
            // Check required fields before calling requestTranscription
            if (
                !recording.filename ||
                !recording.filePath ||
                typeof recording.filename !== 'string' ||
                typeof recording.filePath !== 'string'
            ) {
                console.error(
                    `Skipping recording ${recording._id}: Missing or invalid filename or filePath.`,
                    {
                        filename: recording.filename,
                        filePath: recording.filePath
                    }
                );
                continue;
            }

            const preferredPath = recording.filename
                ? path.join(config.storagePath, recording.filename)
                : null;

            const localFileHandle = await ensureLocalRecordingFile({
                preferredPath,
                audioKey: recording.audioKey,
                filename: recording.filename
            });

            // Build GCS URI if we have the object name
            let gcsUri = null;
            if (recording.audioKey) {
                const bucketName = config.googleCloudStorage?.bucketName;
                if (bucketName) {
                    gcsUri = `gs://${bucketName}/${recording.audioKey}`;
                }
            }
            
            const audioFile = {
                filename: recording.filename || path.basename(localFileHandle.localPath),
                path: localFileHandle.localPath,
                size: recording.fileSize || localFileHandle.size,
                mimetype: recording.format ? `audio/${recording.format}` : 'audio/wav',
                cloudStorageUrl: recording.filePath,
                cloudStorageObject: recording.audioKey,
                gcsUri: gcsUri
            };

            try {
                await requestTranscription(audioFile, recording._id, {
                    enableFallback: false,
                    maxAttempts: 1,
                    languageCode: 'auto'
                });
            } finally {
                await localFileHandle.cleanup();
            }
        } catch (error) {
            console.error(`Error requesting transcription for recording ${recording._id}:`, error);
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