const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const { Session, Recording, Client } = require('../models');
const { 
  requestTranscription, 
  fetchTranscriptionStatus,
  TRANSCRIPTION_CONFIG,
  CHUNK_CONFIG
} = require('../services/audioProcessing/transcribeAudio.service');
const { 
  generateSessionSummary, 
  generateClientSummaryAndUpdateFromNote 
} = require('../services/aiProcessing/noteGeneration');


const { 
  uploadRecordingToBucket,
  ensureLocalRecordingFile
} = require('./storage/googleCloudStorage.service');

const uploadDir = config.storagePath;//path.join(__dirname, '../uploads');
/**
 * Start a new recording session
 */
const startRecordingSession = async (user) => {
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
    await unknownClient.save();
    
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
    await newSession.save();
    
    return { session: newSession, client: unknownClient };
    
  } catch (error) {
    console.error('Start recording error:', error);
    throw error;
  }
};

/**
 * Upload recording with enhanced error handling
 */
const uploadRecording = async (sessionId, audioFile, duration, user, io, options = {}) => {
  const therapistId = user._id;
  
  // Verify session ownership
  const sessionDoc = await Session.findOne({
    _id: sessionId,
    therapistId
  });
  
  if (!sessionDoc) {
    throw new Error('Session not found');
  }

  // Create recording document with enhanced tracking
  const recording = new Recording({
    sessionId,
    therapistId,
    recordingType: 'session_recording',
    audioKey: null,
    duration: duration || 0,
    filename: audioFile.filename,
    filePath: path.join(uploadDir, audioFile.filename),
    fileSize: audioFile.size,
    format: audioFile.mimetype.split('/')[1],
    transcriptionStatus: 'processing',
    recordedAt: new Date(),
    retryConfig: {
      maxRetries: options.maxRetries || 3,
      currentRetry: 0,
      fallbackEnabled: options.fallbackEnabled !== false,
      preferredTool: options.preferredTool || config.transcriptionConfig.default
    }
  });
  
  // Add initial attempt
  recording.addTranscriptionAttempt({
    tool: recording.retryConfig.preferredTool,
    status: 'attempting',
    batchProcessed: false
  });
  
  await recording.save();

  // Upload to Google Cloud Storage and store remote reference
  try {
    const uploadResult = await uploadRecordingToBucket({
      localPath: audioFile.path,
      recordingId: recording._id.toString(),
      filename: audioFile.originalname || audioFile.filename,
      mimetype: audioFile.mimetype
    });

    if (uploadResult?.publicUrl) {
      recording.audioUrl = uploadResult.publicUrl;
      recording.filePath = uploadResult.publicUrl;
      recording.audioKey = uploadResult.objectName;
      await recording.save();

      audioFile.cloudStorageUrl = uploadResult.publicUrl;
      audioFile.cloudStorageObject = uploadResult.objectName;
      audioFile.gcsUri = uploadResult.gcsUri;
    }
  } catch (cloudError) {
    console.error(`Cloud upload failed for recording ${recording._id}:`, cloudError.message);
  }
  
  // Update session
  await Session.findByIdAndUpdate(sessionId, {
    status: 'transcribing',
    $push: {
      recordings: {
        recordingId: recording._id,
        recordingType: 'session_recording',
        duration: recording.duration,
        recordedAt: recording.recordedAt
      }
    },
    $inc: {
      'stats.recordingCount': 1,
      'stats.totalDuration': recording.duration || 0
    }
  });
  
  // Process transcription in background
  processTranscriptionInBackground(recording, audioFile, sessionId, io).catch(err => {
    console.error(`Background processing error for ${recording._id}:`, err);
  });

  return {
    recordingId: recording._id,
    audioUrl: recording.audioUrl,
    transcriptionStatus: recording.transcriptionStatus,
    retryConfig: recording.retryConfig
  };
};

/**
 * Background transcription processing with enhanced error handling
 */
const processTranscriptionInBackground = async (recording, audioFile, sessionId, io) => {
  let currentRecording = recording;
  let partialTranscriptionText = recording.transcriptionText || '';
  const chunkProgressEntries = [];

  const handleChunkProgress = async ({ chunkResult, chunkIndex, totalChunks, chunk, toolName }) => {
    try {
      const chunkText = (chunkResult?.transcriptionText || '').trim();
      if (chunkText) {
        partialTranscriptionText = partialTranscriptionText
          ? `${partialTranscriptionText} ${chunkText}`.trim()
          : chunkText;
      }

      const chunkInfo = {
        index: chunkIndex,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        status: 'completed',
        transcribedAt: new Date()
      };

      chunkProgressEntries[chunkIndex] = chunkInfo;
      const completedChunks = chunkProgressEntries.filter(Boolean);

      const batchInfo = {
        totalChunks,
        processedChunks: completedChunks.length,
        failedChunks: [],
        chunkDuration: chunk.duration,
        overlap: CHUNK_CONFIG.overlap,
        chunks: completedChunks
      };

      await Recording.findByIdAndUpdate(currentRecording._id, {
        $set: {
          transcriptionText: partialTranscriptionText,
          transcriptionStatus: 'processing',
          'transcriptionMetadata.provider': toolName,
          'transcriptionMetadata.batchInfo': batchInfo
        }
      });

      if (io && currentRecording.therapistId) {
        io.to(currentRecording.therapistId.toString()).emit('recordingTranscriptionChunk', {
          recordingId: currentRecording._id,
          sessionId: currentRecording.sessionId,
          chunkIndex,
          totalChunks,
          progress: completedChunks.length / totalChunks,
          chunkText,
          transcriptionText: partialTranscriptionText,
          provider: toolName,
          startTime: chunk.startTime,
          endTime: chunk.endTime
        });
      }
    } catch (chunkError) {
      console.error(`Chunk progress update failed for recording ${currentRecording._id}:`, chunkError.message);
    }
  };
  
  try {
    // Request transcription with fallback
    const transcriptionResult = await requestTranscription(
      audioFile, 
      currentRecording._id,
      {
        preferredTool: currentRecording.retryConfig.preferredTool,
        enableFallback: currentRecording.retryConfig.fallbackEnabled,
        maxAttempts: currentRecording.retryConfig.maxRetries,
        onChunkProgress: handleChunkProgress
      }
    );
    
    // Reload recording to get latest state
    currentRecording = await Recording.findById(recording._id);
    if (!currentRecording) {
      throw new Error('Recording not found after transcription');
    }
    
    // Update the last attempt with job ID if available
    if (currentRecording.transcriptionAttempts.length > 0) {
      const lastAttempt = currentRecording.transcriptionAttempts[currentRecording.transcriptionAttempts.length - 1];
      const jobId = transcriptionResult.transcriptionMetadata?.jobId || null;
      if (jobId && !lastAttempt.jobId) {
        lastAttempt.jobId = jobId;
      }
      // Update tool if different (in case of fallback)
      const actualTool = transcriptionResult.transcriptionMetadata?.provider;
      if (actualTool && lastAttempt.tool !== actualTool) {
        lastAttempt.tool = actualTool;
      }
    }
    
    // Mark success
    currentRecording.markTranscriptionSuccess(transcriptionResult);
    await currentRecording.save();
    
    // Update session status
    await Session.findByIdAndUpdate(sessionId, { 
      status: 'completed' 
    });
    
    // Generate summary
    try {
      await createSessionSummary(currentRecording);
    } catch (summaryError) {
      console.error(`Summary generation error for ${recording._id}:`, summaryError);
      // Don't fail the whole process if summary fails
    }
    
    // Clean up audio file and chunks after successful transcription
    await cleanupAudioFile(audioFile);
    
    // Emit success event
    if (io && currentRecording.therapistId) {
      io.to(currentRecording.therapistId.toString()).emit('recordingTranscriptionCompleted', {
        recordingId: currentRecording._id,
        sessionId: currentRecording.sessionId,
        transcriptionStatus: 'completed',
        attempts: currentRecording.transcriptionAttempts.length,
        provider: transcriptionResult.transcriptionMetadata?.provider
      });
    }
    
  } catch (error) {
    console.error(`Transcription failed for ${recording._id}:`, error);
    
    // Reload to get latest state
    currentRecording = await Recording.findById(recording._id);
    if (!currentRecording) {
      console.error('Recording not found for error handling');
      // Still try to clean up files
      await cleanupAudioFile(audioFile);
      return;
    }
    
    // Determine which tool actually failed (from error metadata, or fallback to preferred tool)
    const failedTool = error.failedTool || error.attemptedTools?.[error.attemptedTools.length - 1] || currentRecording.retryConfig.preferredTool;
    const jobId = error.jobId || error.toolJobIds?.[failedTool] || null;
    
    // Update the last attempt with job ID if available
    if (currentRecording.transcriptionAttempts.length > 0) {
      const lastAttempt = currentRecording.transcriptionAttempts[currentRecording.transcriptionAttempts.length - 1];
      if (jobId && !lastAttempt.jobId) {
        lastAttempt.jobId = jobId;
      }
      // Also update the tool if it's different from what we recorded
      if (failedTool && lastAttempt.tool !== failedTool) {
        lastAttempt.tool = failedTool;
      }
    }
    
    // Mark failure with the actual tool that failed
    currentRecording.markTranscriptionFailed(error, failedTool);
    await currentRecording.save();
    
    // Update session status
    await Session.findByIdAndUpdate(sessionId, { 
      status: currentRecording.transcriptionStatus === 'retrying' ? 'transcribing' : 'failed'
    });
    
    // If should retry, add to retry queue (don't clean up files yet - might need them for retry)
    if (currentRecording.shouldRetry()) {
      console.log(`Recording ${recording._id} queued for retry at ${currentRecording.retryConfig.nextRetryAt}`);
      
      // Emit retry event
      if (io && currentRecording.therapistId) {
        io.to(currentRecording.therapistId.toString()).emit('recordingTranscriptionRetrying', {
          recordingId: currentRecording._id,
          sessionId: currentRecording.sessionId,
          retryAt: currentRecording.retryConfig.nextRetryAt,
          attempt: currentRecording.retryConfig.currentRetry,
          maxAttempts: currentRecording.retryConfig.maxRetries
        });
      }
    } else {
      // Final failure - clean up files since we won't retry
      await cleanupAudioFile(audioFile);
      
      // Emit final failure
      if (io && currentRecording.therapistId) {
        io.to(currentRecording.therapistId.toString()).emit('recordingTranscriptionFailed', {
          recordingId: currentRecording._id,
          sessionId: currentRecording.sessionId,
          error: error.message,
          attempts: currentRecording.transcriptionAttempts.length
        });
      }
    }
  }
};

/**
 * Resume incomplete transcriptions that were cut off during server crash
 */
const resumeIncompleteTranscriptions = async (io) => {
  try {
    const incompleteRecordings = await Recording.findIncompleteTranscriptions();
    
    if (incompleteRecordings.length === 0) {
      console.log('[Resume] No incomplete transcriptions found');
      return { resumed: 0 };
    }
    
    console.log(`[Resume] Found ${incompleteRecordings.length} incomplete transcription(s) to resume`);
    
    for (const recording of incompleteRecordings) {
      try {
        const batchInfo = recording.transcriptionMetadata?.batchInfo;
        const isBatchProcessing = batchInfo && batchInfo.totalChunks > 0;
        const processedChunks = batchInfo?.processedChunks || 0;
        const totalChunks = batchInfo?.totalChunks || 0;
        
        console.log(`[Resume] Resuming recording ${recording._id}: ${processedChunks}/${totalChunks} chunks completed`);
        
        // Get the audio file
        const preferredPath = recording.filename
          ? path.join(uploadDir, recording.filename)
          : null;

        const localFileHandle = await ensureLocalRecordingFile({
          preferredPath,
          audioKey: recording.audioKey,
          filename: recording.filename
        });
        
        const audioFile = {
          filename: recording.filename || path.basename(localFileHandle.localPath),
          path: localFileHandle.localPath,
          size: recording.fileSize || localFileHandle.size,
          mimetype: recording.format ? `audio/${recording.format}` : 'audio/wav',
          cloudStorageUrl: recording.filePath,
          cloudStorageObject: recording.audioKey
        };
        
        // Determine resume point
        const resumeFromChunk = processedChunks;
        const toolName = recording.retryConfig?.preferredTool || recording.transcriptionMetadata?.provider || 'assemblyai';
        
        if (isBatchProcessing && resumeFromChunk < totalChunks) {
          console.log(`[Resume] Resuming batch processing from chunk ${resumeFromChunk + 1}/${totalChunks}`);
          
          // Enhanced chunk progress handler that merges with existing transcription
          const handleChunkProgress = async ({ chunkResult, chunkIndex, totalChunks, chunk, toolName }) => {
            try {
              const chunkText = (chunkResult?.transcriptionText || '').trim();
              const currentRecording = await Recording.findById(recording._id);
              if (!currentRecording) return;
              
              // Start with existing transcription text
              let partialTranscriptionText = currentRecording.transcriptionText || '';
              if (chunkText) {
                partialTranscriptionText = partialTranscriptionText
                  ? `${partialTranscriptionText} ${chunkText}`.trim()
                  : chunkText;
              }

              const chunkInfo = {
                index: chunkIndex,
                startTime: chunk.startTime,
                endTime: chunk.endTime,
                status: 'completed',
                transcribedAt: new Date()
              };

              // Get existing chunks and update
              const existingChunks = currentRecording.transcriptionMetadata?.batchInfo?.chunks || [];
              existingChunks[chunkIndex] = chunkInfo;
              const completedChunks = existingChunks.filter(Boolean);

              const updatedBatchInfo = {
                totalChunks,
                processedChunks: completedChunks.length,
                failedChunks: [],
                chunkDuration: chunk.duration,
                overlap: CHUNK_CONFIG.overlap,
                chunks: completedChunks
              };

              await Recording.findByIdAndUpdate(currentRecording._id, {
                $set: {
                  transcriptionText: partialTranscriptionText,
                  transcriptionStatus: 'processing',
                  'transcriptionMetadata.provider': toolName,
                  'transcriptionMetadata.batchInfo': updatedBatchInfo
                }
              });

              if (io && currentRecording.therapistId) {
                io.to(currentRecording.therapistId.toString()).emit('recordingTranscriptionChunk', {
                  recordingId: currentRecording._id,
                  sessionId: currentRecording.sessionId,
                  chunkIndex,
                  totalChunks,
                  progress: completedChunks.length / totalChunks,
                  chunkText,
                  transcriptionText: partialTranscriptionText,
                  provider: toolName,
                  startTime: chunk.startTime,
                  endTime: chunk.endTime
                });
              }
            } catch (chunkError) {
              console.error(`[Resume] Chunk progress update failed:`, chunkError.message);
            }
          };
          
          // Call requestTranscription with resume options
          const { requestTranscription } = require('./audioProcessing/transcribeAudio.service');
          
          const existingText = recording.transcriptionText || '';
          
          const transcriptionResult = await requestTranscription(
            audioFile,
            recording._id,
            {
              preferredTool: toolName,
              enableFallback: recording.retryConfig?.fallbackEnabled !== false,
              maxAttempts: recording.retryConfig?.maxRetries || 3,
              onChunkProgress: handleChunkProgress,
              resumeFromChunk: resumeFromChunk,
              existingResults: [] // We'll merge text, not results
            }
          );
          
          // Reload recording to get the latest state (with merged text from handleChunkProgress)
          const updatedRecording = await Recording.findById(recording._id);
          if (!updatedRecording) {
            throw new Error('Recording not found after resume');
          }
          
          // Merge the result text with existing text (handleChunkProgress should have done this, but ensure it)
          const finalText = updatedRecording.transcriptionText || transcriptionResult.transcriptionText || '';
          
          // Update transcription result to include merged text
          transcriptionResult.transcriptionText = finalText;
          
          // Mark success with merged result
          updatedRecording.markTranscriptionSuccess(transcriptionResult);
          await updatedRecording.save();
          
          console.log(`[Resume] Recording ${recording._id} completed after resume`);
          
          // Update session status
          await Session.findByIdAndUpdate(recording.sessionId, { 
            status: 'completed' 
          });
          
          // Emit success event
          if (io && recording.therapistId) {
            io.to(recording.therapistId.toString()).emit('recordingTranscriptionCompleted', {
              recordingId: recording._id,
              sessionId: recording.sessionId,
              transcriptionStatus: 'completed',
              attempts: updatedRecording.transcriptionAttempts.length,
              provider: transcriptionResult.transcriptionMetadata?.provider
            });
          }
          
        } else {
          // Not batch processing or all chunks done - just reprocess normally
          console.log(`[Resume] Reprocessing recording ${recording._id} (not batch or all chunks done)`);
          await processTranscriptionInBackground(
            recording,
            audioFile,
            recording.sessionId,
            io
          );
        }
        
        await localFileHandle.cleanup();
        
      } catch (error) {
        console.error(`[Resume] Error resuming recording ${recording._id}:`, error);
        // Mark as failed if we can't resume
        recording.transcriptionStatus = 'failed';
        recording.transcriptionError = {
          message: `Resume failed: ${error.message}`,
          timestamp: new Date(),
          isRecoverable: false
        };
        await recording.save();
      }
    }
    
    return {
      resumed: incompleteRecordings.length,
      timestamp: new Date()
    };
    
  } catch (error) {
    console.error('[Resume] Error resuming incomplete transcriptions:', error);
    throw error;
  }
};

/**
 * Process recordings in retry queue (run via cron job)
 */
const processRetryQueue = async (io) => {
  try {
    const recordingsToRetry = await Recording.findReadyForRetry().limit(10);
    
    console.log(`Processing ${recordingsToRetry.length} recordings in retry queue`);
    
    for (const recording of recordingsToRetry) {
      try {
        const preferredPath = recording.filename
          ? path.join(uploadDir, recording.filename)
          : null;

        const localFileHandle = await ensureLocalRecordingFile({
          preferredPath,
          audioKey: recording.audioKey,
          filename: recording.filename
        });
        
        const audioFile = {
          filename: recording.filename || path.basename(localFileHandle.localPath),
          path: localFileHandle.localPath,
          size: recording.fileSize || localFileHandle.size,
          mimetype: recording.format ? `audio/${recording.format}` : 'audio/wav',
          cloudStorageUrl: recording.filePath,
          cloudStorageObject: recording.audioKey
        };
        
        // Check if we've exceeded max retries before processing
        if (recording.retryConfig.currentRetry >= recording.retryConfig.maxRetries) {
          console.log(`Recording ${recording._id} has reached max retries (${recording.retryConfig.currentRetry}/${recording.retryConfig.maxRetries}), skipping...`);
          recording.transcriptionStatus = 'failed';
          recording.retryConfig.nextRetryAt = null; // Clear retry time to prevent future picks
          await recording.save();
          continue;
        }
        
        // Process with new attempt
        recording.addTranscriptionAttempt({
          tool: recording.retryConfig.preferredTool,
          status: 'attempting'
        });
        recording.transcriptionStatus = 'processing';
        await recording.save();
        
        try {
          await processTranscriptionInBackground(
            recording,
            audioFile,
            recording.sessionId,
            io
          );
        } finally {
          await localFileHandle.cleanup();
        }
        
      } catch (error) {
        console.error(`Error retrying recording ${recording._id}:`, error);
        if (error.message === 'Audio key missing; cannot download recording from cloud storage') {
          recording.transcriptionStatus = 'failed';
          recording.transcriptionError = {
            message: error.message,
            code: 'FILE_NOT_FOUND',
            timestamp: new Date(),
            isRecoverable: false
          };
          await recording.save();
        }
      }
    }
    
    return {
      processed: recordingsToRetry.length,
      timestamp: new Date()
    };
    
  } catch (error) {
    console.error('Error processing retry queue:', error);
    throw error;
  }
};

/**
 * Clean up audio file after successful transcription
 * Also cleans up chunk directories if they exist
 */
const cleanupAudioFile = async (audioFile) => {
  if (!audioFile) return;
  
  // Delete the main audio file
  if (audioFile.path) {
    try {
      await fs.unlink(audioFile.path);
      console.log(`[Cleanup] Deleted audio file: ${audioFile.path}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`[Cleanup] Error deleting audio file ${audioFile.path}:`, err.message);
      }
    }
  }
  
  // Also delete by filename if path is different
  if (audioFile.filename && audioFile.path !== path.join(uploadDir, audioFile.filename)) {
    const filenamePath = path.join(uploadDir, audioFile.filename);
    try {
      await fs.unlink(filenamePath);
      console.log(`[Cleanup] Deleted audio file by filename: ${filenamePath}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`[Cleanup] Error deleting audio file ${filenamePath}:`, err.message);
      }
    }
  }
  
  // Clean up chunk directory if it exists (for batch processing)
  if (audioFile.path || audioFile.filename) {
    const baseName = path.basename(
      audioFile.path || audioFile.filename, 
      path.extname(audioFile.path || audioFile.filename)
    );
    const chunkDir = path.join(uploadDir, 'chunks', baseName);
    
    try {
      const entries = await fs.readdir(chunkDir, { withFileTypes: true });
      
      // Delete all files in chunk directory
      for (const entry of entries) {
        const fullPath = path.join(chunkDir, entry.name);
        if (entry.isDirectory()) {
          // Recursively delete subdirectories
          const subEntries = await fs.readdir(fullPath, { withFileTypes: true });
          for (const subEntry of subEntries) {
            await fs.unlink(path.join(fullPath, subEntry.name)).catch(() => {});
          }
          await fs.rmdir(fullPath).catch(() => {});
        } else {
          await fs.unlink(fullPath);
        }
      }
      
      // Delete the chunk directory itself
      await fs.rmdir(chunkDir);
      console.log(`[Cleanup] Deleted chunk directory: ${chunkDir}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`[Cleanup] Error deleting chunk directory ${chunkDir}:`, err.message);
      }
    }
  }
};

/**
 * Update recording metadata (existing function - kept for compatibility)
 */
const updateRecordingMetadata = async (recordingId, data, user) => {
  try {
    const therapistId = user._id;
    const { 
      recordingType, 
      clientAction,
      clientId, 
      clientData 
    } = data;
    
    const recording = await Recording.findOne({
      _id: recordingId,
      therapistId
    });
    
    if (!recording) {
      throw new Error('Recording not found');
    }
    
    const session = await Session.findById(recording.sessionId);
    let finalClientId = session.clientId;
    let updatedClient = null;
    
    if (clientAction === 'existing' && clientId) {
      const existingClient = await Client.findOne({
        _id: clientId,
        handler: therapistId
      });
      
      if (!existingClient) {
        throw new Error('Client not found');
      }
      
      await Client.findOneAndDelete({
        _id: session.clientId,
        status: 'unknown'
      });
      
      finalClientId = clientId;
      updatedClient = existingClient;
      
    } else if (clientAction === 'new' && clientData) {
      const unknownClient = await Client.findById(session.clientId);
      
      if (unknownClient && unknownClient.status === 'unknown') {
        unknownClient.firstName = clientData.firstName;
        unknownClient.lastName = clientData.lastName;
        unknownClient.email = clientData.email;
        unknownClient.phone = clientData.phone;
        unknownClient.dateOfBirth = clientData.dateOfBirth;
        unknownClient.status = 'active';
        unknownClient.clientNumber = clientData.clientNumber || 
          `${clientData.lastName}${Date.now()}`.toLowerCase();
        
        await unknownClient.save();
        updatedClient = unknownClient;
        finalClientId = unknownClient._id;
      }
    }
    
    recording.recordingType = recordingType;
    await recording.save();
    
    session.clientId = finalClientId;
    await session.save();
    
    if (updatedClient && updatedClient.status === 'active') {
      await Client.findByIdAndUpdate(
        finalClientId,
        {
          $inc: { 'stats.totalSessions': 1 },
          $set: { 
            'stats.lastSessionDate': session.sessionDate,
            'stats.firstSessionDate': updatedClient.stats.firstSessionDate || session.sessionDate
          }
        }
      );
    }
    
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
    };
    
  } catch (error) {
    console.error('Update metadata error:', error);
    throw error;
  }
};

/**
 * Check Salad transcription status (async jobs)
 */
const checkAndUpdateRecordingTranscription = async (recordingId) => {
  const recording = await Recording.findById(recordingId);
  if (!recording) {
    throw new Error('Recording not found');
  }
  
  try {
    if (!recording.transcriptionMetadata?.jobId) {
      throw new Error('No Salad Job ID found in transcriptionMetadata');
    }
    
    const transcriptionResult = await fetchTranscriptionStatus(
      recording.transcriptionMetadata.jobId
    );
    
    if (transcriptionResult.transcriptionStatus === 'processing') {
      console.log(`Job ${recording.transcriptionMetadata.jobId} still processing...`);
      return { status: 'processing' };
    }
    
    recording.markTranscriptionSuccess(transcriptionResult);
    await recording.save();
    
    try {
      await createSessionSummary(recording);
    } catch (error) {
      console.error(`Error generating summary:`, error.message);
    }
    
    return { status: 'completed', recording };
    
  } catch (error) {
    recording.markTranscriptionFailed(error, 'salad');
    await recording.save();
    throw error;
  }
};

/**
 * Create session summary
 */
const createSessionSummary = async (recording) => {
  const session = await Session.findById(recording.sessionId)
    .populate("clientId")
    .populate("recordings.recordingId");
    
  if (!session) {
    throw new Error('Session not found for summary generation');
  }
  
  const { summary, title } = await generateSessionSummary(session);
  session.title = title;
  
  if (session.metadata) {
    session.metadata.summary = summary;
  } else {
    session.metadata = { summary };
  }
  
  await session.save();
  await generateClientSummaryAndUpdateFromNote(session);
};

/**
 * Get transcription statistics
 */
const getTranscriptionStats = async (therapistId, dateRange) => {
  const stats = await Recording.getTranscriptionStats(therapistId, dateRange);
  
  // Calculate tool-specific success rates
  const toolStats = await Recording.aggregate([
    {
      $match: {
        therapistId: therapistId,
        createdAt: { $gte: dateRange.start, $lte: dateRange.end },
        transcriptionStatus: 'completed'
      }
    },
    {
      $group: {
        _id: '$transcriptionMetadata.provider',
        count: { $sum: 1 },
        avgProcessingTime: { $avg: '$transcriptionMetadata.processingTime' },
        avgAttempts: { $avg: '$transcriptionMetadata.attemptNumber' }
      }
    }
  ]);
  
  return {
    overall: stats,
    byTool: toolStats
  };
};

/**
 * Manual retry for failed recording
 */
const manualRetryTranscription = async (recordingId, options = {}) => {
  const recording = await Recording.findById(recordingId);
  
  if (!recording) {
    throw new Error('Recording not found');
  }
  
  if (recording.transcriptionStatus === 'completed') {
    throw new Error('Recording already transcribed');
  }
  
  // Override retry config if needed
  if (options.preferredTool) {
    recording.retryConfig.preferredTool = options.preferredTool;
  }
  
  // Reset retry counter if forcing
  if (options.force) {
    recording.retryConfig.currentRetry = 0;
    recording.retryConfig.nextRetryAt = new Date();
  }
  
  recording.transcriptionStatus = 'processing';
  recording.addTranscriptionAttempt({
    tool: recording.retryConfig.preferredTool,
    status: 'attempting'
  });
  await recording.save();
  
  const preferredPath = recording.filename
    ? path.join(uploadDir, recording.filename)
    : null;
  const localFileHandle = await ensureLocalRecordingFile({
    preferredPath,
    audioKey: recording.audioKey,
    filename: recording.filename
  });

  const audioFile = {
    filename: recording.filename || path.basename(localFileHandle.localPath),
    path: localFileHandle.localPath,
    size: recording.fileSize || localFileHandle.size,
    mimetype: recording.format ? `audio/${recording.format}` : 'audio/wav',
    cloudStorageUrl: recording.filePath,
    cloudStorageObject: recording.audioKey
  };
  
  try {
    await processTranscriptionInBackground(
      recording,
      audioFile,
      recording.sessionId,
      null // No socket.io for manual retry
    );
  } finally {
    await localFileHandle.cleanup();
  }
  
  return recording;
};

module.exports = {
  startRecordingSession,
  uploadRecording,
  updateRecordingMetadata,
  checkAndUpdateRecordingTranscription,
  processRetryQueue,
  resumeIncompleteTranscriptions,
  getTranscriptionStats,
  manualRetryTranscription,
};