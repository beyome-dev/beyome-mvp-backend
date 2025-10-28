const mongoose = require('mongoose');

const config = require('../config');
const { Session, Recording, Client } = require('../models');
const { requestTranscription } = require('../services/audioProcessing/transcribeAudio.service');


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

const uploadRecording = async (sessionId, audioFile, duration, user) => {
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
    
    let url =`${config.APP_URL}/files/${audioFile.filename}`;
    if (process.env.NODE_ENV === 'development') {
        url = `https://drive.google.com/uc?export=download&id=1aTdDS9oGf80MbG2kicOlEKqEcA_Do47i`
    }
    // Upload to Cloud Storage
    // const { url, key } = await uploadToCloud({
    //   file: audioFile,
    //   folder: `audio/${therapistId}/${sessionId}`,
    //   fileName: `${Date.now()}-${audioFile.originalname}`
    // });
    
    // Create recording document
    const recording = new Recording({
      sessionId,
      therapistId,
      recordingType: 'session_recording', // default, can be changed later
      audioUrl: url,
      audioKey: "nan",//key,
      duration: duration || 0,
      fileSize: audioFile.size,
      format: audioFile.mimetype.split('/')[1],
      transcriptionStatus: 'pending',
      recordedAt: new Date()
    });
    
    await recording.save();
    
    // Update session with embedded recording reference
    await Session.findByIdAndUpdate(sessionId, {
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
    
    // Queue for transcription (async)
    // await queueTranscription(recording._id);
    const transcriptionResult = await requestTranscription(recording.audioUrl, sessionId);
    // Update recording with transcription
    recording.transcriptionText = transcriptionResult.transcriptionText;
    recording.transcriptionStatus = transcriptionResult.transcriptionStatus;
    recording.transcriptionMetadata = transcriptionResult.transcriptionMetadata
    await recording.save();

    return {
        recordingId: recording._id,
        audioUrl: recording.audioUrl,
        transcriptionStatus: recording.transcriptionStatus
    }
}

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

module.exports = {
    startRecordingSession,
    uploadRecording,
    updateRecordingMetadata,
    updateRecordingTranscriptionMetadata
}