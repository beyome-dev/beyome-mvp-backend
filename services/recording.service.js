const mongoose = require('mongoose');
const path = require('path');
const uploadDir = path.join(__dirname, '../uploads');

const config = require('../config');
const { Session, Recording, Client } = require('../models');
const { requestTranscription, fetchTranscriptionStatus } = require('../services/audioProcessing/transcribeAudio.service');
const { generateSessionSummary, generateClientSummaryAndUpdateFromNote } = require('../services/aiProcessing/noteGeneration');
const { session } = require('passport');

const startRecordingSession = async (user) => {
// const session = await mongoose.startSession();
//   session.startTransaction();
  
    const therapistId = user._id;
    const timestamp = Date.now();

  try {
    
    // Create temporary unknown client
    const unknownClient = new Client({
      handler: therapistId,
      firstName: 'Unknown',
      lastName: `#${timestamp}`,
      status: 'unknown',
      clientNumber: `unknown#${timestamp}`,
      metadata: {
        customFields: {
          temporaryCreatedAt: new Date()
        }
      }
    });
    await unknownClient.save()//({ session });
    
    // Create new session
    const newSession = new Session({
      therapistId,
      clientId: unknownClient._id,
      sessionDate: new Date(),
      status: 'in_progress',
      recordings: [],
      stats: {
        recordingCount: 0,
        totalDuration: 0,
        noteCount: 0
      }
    });
    await newSession.save()//({ session });
    
    // await session.commitTransaction();
    
    return { session: newSession, client: unknownClient };
    
  } catch (error) {
    // await session.abortTransaction();
    console.error('Start recording error:', error);
    throw error;
  } 
//   finally {
//     session.endSession();
//   }
}

const uploadRecording = async (sessionId, audioFile, duration, user, io) => {
    // Implementation for uploading a recording
    const therapistId = user._id;
    
    // Verify session ownership
    const sessionDoc = await Session.findOne({
      _id: sessionId,
      therapistId
    });
    
    if (!sessionDoc) {
      throw new Error('Session not found');
    }

    
    // Create recording document
    const recording = new Recording({
      sessionId,
      therapistId,
      recordingType: 'session_recording', // default, can be changed later
      audioKey: "nan",//key,
      duration: duration || 0,
      filename:audioFile.filename,
      filePath: path.join(uploadDir, audioFile.filename),
      fileSize: audioFile.size,
      format: audioFile.mimetype.split('/')[1],
      transcriptionStatus: 'processing',
      recordedAt: new Date()
    });
    
    await recording.save();
    
    // Update session with embedded recording reference
    await Session.findByIdAndUpdate(sessionId, {
      status: 'transcribing',
      $push: {
        recordings: {
          recordingId: recording._id,
          recordingType: 'session_recording',
          duration: recording.duration,
          recordedAt: recording.recordedAt,
          // hasSummary: false
        }
      },
      $inc: {
        'stats.recordingCount': 1,
        'stats.totalDuration': recording.duration || 0
      }
    });
    
    // Process transcription in background (non-blocking)
    processTranscriptionInBackground(recording, audioFile, sessionId, io);

    return {
        recordingId: recording._id,
        audioUrl: recording.audioUrl,
        transcriptionStatus: recording.transcriptionStatus
    }
}

// Background processing function
const processTranscriptionInBackground = async (recording, audioFile, sessionId, io) => {
    try {
        // Request transcription
        const transcriptionResult = await requestTranscription(audioFile, sessionId);
        
        // Update recording with transcription results
        await Recording.findByIdAndUpdate(recording._id, {
            transcriptionText: transcriptionResult.transcriptionText,
            transcriptionStatus: transcriptionResult.transcriptionStatus,
            transcriptionMetadata: transcriptionResult.transcriptionMetadata
        });
        if (transcriptionResult.transcriptionMetadata?.provider !== 'salad') {
          await Session.findByIdAndUpdate(recording.sessionId, { status: 'completed' });
          try {
              await createSessionSummary(recording);
          } catch (error) {
                console.error(`Error generating summary for recording ${recording._id}:`, error.message);
          }
          io.to(recording.therapistId.toString()).emit('recordingTranscriptionCompleted', {
            recordingId: recording._id,
            sessionId: recording.sessionId,
            transcriptionStatus: transcriptionResult.transcriptionStatus,
          });
        }
    } catch (error) {
        // Update recording with error status
        await Recording.findByIdAndUpdate(recording._id, { 
            transcriptionStatus: 'failed',
            transcriptionError: {
              message: error.message,
              code: 'TRANSCRIPTION_ERROR',
              timestamp: new Date()
            }
        });
        
        console.error(`Transcription failed for recording ${recordingId}:`, error);
    }
};


const updateRecordingMetadata = async (recordingId, data, user) => {
//     const mongoSession = await mongoose.startSession();
//   mongoSession.startTransaction();
  
  try {
    const therapistId = user._id;
    const { 
      recordingType, 
      clientAction, // 'existing', 'new', 'keep_unknown'
      clientId, 
      clientData 
    } = data;
    
    // Verify recording ownership
    const recording = await Recording.findOne({
      _id: recordingId,
      therapistId
    });
    
    if (!recording) {
        throw new Error('Session not found');
    }
    
    const session = await Session.findById(recording.sessionId);
    let finalClientId = session.clientId;
    let updatedClient = null;
    
    // Handle client assignment
    if (clientAction === 'existing' && clientId) {
      // Assign to existing client
      const existingClient = await Client.findOne({
        _id: clientId,
        handler: therapistId
      });
      
      if (!existingClient) {
        throw new Error('Client not found');
      }
      
      // Delete the temporary unknown client
      await Client.findOneAndDelete({
        _id: session.clientId,
        status: 'unknown'
      })//, { session: mongoSession });
      
      finalClientId = clientId;
      updatedClient = existingClient;
      
    } else if (clientAction === 'new' && clientData) {
      // Create new client (replace unknown)
      const unknownClient = await Client.findById(session.clientId);
      
      if (unknownClient && unknownClient.status === 'unknown') {
        // Update the unknown client with real data
        unknownClient.firstName = clientData.firstName;
        unknownClient.lastName = clientData.lastName;
        unknownClient.email = clientData.email;
        unknownClient.phone = clientData.phone;
        unknownClient.dateOfBirth = clientData.dateOfBirth;
        unknownClient.status = 'active';
        unknownClient.clientNumber = clientData.clientNumber || 
          `${clientData.lastName}${Date.now()}`.toLowerCase();
        
        await unknownClient.save()//{ session: mongoSession });
        updatedClient = unknownClient;
        finalClientId = unknownClient._id;
      }
    }
    // If 'keep_unknown', do nothing with client
    
    // Update recording
    recording.recordingType = recordingType;
    await recording.save()//{ session: mongoSession });
    
    // Update session
    session.clientId = finalClientId;
    await session.save()//{ session: mongoSession });
    
    // Update client stats if we have a real client now
    if (updatedClient && updatedClient.status === 'active') {
      await Client.findByIdAndUpdate(
        finalClientId,
        {
          $inc: { 'stats.totalSessions': 1 },
          $set: { 
            'stats.lastSessionDate': session.sessionDate,
            'stats.firstSessionDate': updatedClient.stats.firstSessionDate || session.sessionDate
          }
        },
        //{ session: mongoSession }
      );
    }
    
    // await mongoSession.commitTransaction();
    
    return {
        recording: {
          _id: recording._id,
          recordingType: recording.recordingType
        },
        session: {
          _id: session._id,
          clientId: session.clientId
        },
        client: updatedClient ? {
          _id: updatedClient._id,
          firstName: updatedClient.firstName,
          lastName: updatedClient.lastName,
          clientNumber: updatedClient.clientNumber,
          status: updatedClient.status
        } : null
    }
    
  } catch (error) {
    // await mongoSession.abortTransaction();
    console.error('Update metadata error:', error);
    return error
  } 
//   finally {
//     mongoSession.endSession();
//   }
}

const updateRecordingTranscriptionMetadata = async (transcriptionResult) => {
    // Update recording with transcription
    recording.transcriptionText = transcriptionResult.text;
    recording.transcriptionStatus = 'completed';
    recording.transcriptionMetadata = {
      provider,
      model: transcriptionResult.model,
      language: transcriptionResult.language,
      confidence: transcriptionResult.confidence,
      timestamps: transcriptionResult.timestamps,
      processedAt: new Date(),
      processingTime: transcriptionResult.processingTime
    };
}

const checkAndUpdateRecordingTranscription = async (recordingId) => {
    const recording = await Recording.findById(recordingId);
    if (!recording) {
        throw new Error('Recording not found');
    }
    try {
      if (!recording.transcriptionMetadata?.jobId) {
        throw error = new Error('No Salad Job ID found in transcriptionMetadata');
      }
      // Fetch job status from Salad API
      const transcriptionResult = await fetchTranscriptionStatus(recording.transcriptionMetadata.jobId);
      if (transcriptionResult.transcriptionStatus === 'processing') {
          console.log(`Job ${recording.transcriptionMetadata.jobId} still processing...`);
          throw new Error('Job ${recording.transcriptionMetadata.jobId} still processing...');
      }
      // Update recording with transcription
      recording.transcriptionText = transcriptionResult.transcriptionText;
      recording.transcriptionStatus = transcriptionResult.transcriptionStatus;
      recording.transcriptionMetadata = transcriptionResult.transcriptionMetadata
      recording.transcriptionError = null;
      await recording.save();
      try {
          await createSessionSummary(recording);  
      } catch (error) {
          console.error(`Error generating summary for recording ${recording._id}:`, error.message);
          throw error;
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
      throw error;
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

module.exports = {
    startRecordingSession,
    uploadRecording,
    updateRecordingMetadata,
    updateRecordingTranscriptionMetadata,
    checkAndUpdateRecordingTranscription
}