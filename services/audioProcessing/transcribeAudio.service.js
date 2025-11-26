const axios = require('axios');
const config = require('../../config');
// Removed AssemblyAI package - using direct API calls instead
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const OpenAI = require('openai');
const { SpeechClient } = require('@google-cloud/speech');
const ffmpeg = require('fluent-ffmpeg');
const FormData = require('form-data');
const { 
  generateSignedReadUrl, 
  withTemporaryPublicAccess,
  uploadChunkToBucket,
  makeFilePrivateIAM
} = require('../storage/googleCloudStorage.service');

const uploadDir = config.storagePath;
const chunkWorkspaceRoot = process.env.CHUNK_WORKSPACE_DIR || path.join(os.tmpdir(), 'recapp-chunks');
let chunkWorkspaceRootLogged = false;
let chunkWorkspaceWarningLogged = false;
const WEBHOOK_URL = `${config.APP_URL}/api/webhook/salad`;
const SALAD_API_URL = 'https://api.salad.com/api/public/organizations/beyome/inference-endpoints/transcribe/jobs';

// Global transcription state tracker to prevent shutdown during active transcription
const transcriptionState = {
  activeTranscriptions: new Set(),
  isActive: () => transcriptionState.activeTranscriptions.size > 0,
  add: (recordingId) => {
    transcriptionState.activeTranscriptions.add(recordingId);
    if (transcriptionState.activeTranscriptions.size === 1) {
      console.log('[Transcription State] Active transcription started, shutdown protection enabled');
    }
  },
  remove: (recordingId) => {
    transcriptionState.activeTranscriptions.delete(recordingId);
    if (transcriptionState.activeTranscriptions.size === 0) {
      console.log('[Transcription State] All transcriptions completed, shutdown protection disabled');
    }
  },
  getActiveCount: () => transcriptionState.activeTranscriptions.size
};

// Configuration
const TRANSCRIPTION_CONFIG = {
  salad: {
    apiKey: config.transcriptionConfig.saladAPIKey,
    priority: 4,
    maxRetries: 2,
    timeout: 300000, // 5 minutes
    supports: { streaming: false, batch: true },
    constraints: {
      maxFileSize: Infinity,
      preferredFormats: ['wav', 'mp3'],
      encodings: ['linear16', 'mp3']
    },
    chunking: null
  },
  openai: {
    apiKey: config.transcriptionConfig.openAIAPIKey,
    priority: 2,
    maxRetries: 2,
    timeout: 180000, // 3 minutes
    supports: { streaming: false, batch: true },
    constraints: {
      maxFileSize: 25 * 1024 * 1024, // 25MB
      preferredFormats: ['mp3', 'wav'],
      encodings: ['mp3', 'wav']
    },
    chunking: {
      format: 'mp3',
      maxDuration: 300,
      maxFileSize: 25 * 1024 * 1024,
      audioCodec: 'libmp3lame',
      audioBitrate: 128,
      audioChannels: 1,
      minSplitDuration: 60,
      sampleRate: 16000
    }
  },
  assemblyai: {
    apiKey: config.transcriptionConfig.assemblyAIAPIKey,
    priority: 1,
    maxRetries: 2,
    timeout: 240000, // 4 minutes
    supports: { streaming: true, batch: true },
    constraints: {
      maxFileSize: 50 * 1024 * 1024,
      preferredFormats: ['wav', 'mp3', 'flac'],
      encodings: ['wav', 'mp3', 'flac']
    },
    chunking: null
  },
  google: {
    apiKey: config.google.apiKey,
    projectId: config.google.projectID,
    priority: 3,
    maxRetries: 2,
    timeout: 240000,
    supports: { streaming: true, batch: true },
    constraints: {
      maxFileSize: 8 * 1024 * 1024, // 8MB raw payload (~10MB base64 limit)
      preferredFormats: ['flac', 'wav'],
      encodings: {
        '.flac': 'FLAC',
        '.wav': 'LINEAR16',
        '.mp3': 'MP3'
      }
    },
    chunking: {
      format: 'flac',
      maxDuration: 55, // 55 seconds to stay under Google's 60-second sync API limit
      maxFileSize: 8 * 1024 * 1024,
      audioCodec: 'flac',
      audioBitrate: null,
      audioChannels: 1,
      minSplitDuration: 30,
      sampleRate: 16000
    }
  }
};

// Chunk configuration for batch processing
const CHUNK_CONFIG = {
  maxDuration: config.chunkMaxDuration || 600, // 10 minutes in seconds
  overlap: config.chunkOverlap || 5, // 5 seconds overlap between chunks
  format: 'wav',
  sampleRate: 16000,
  audioChannels: 1,
  minSplitDuration: 60
};

// Tool-specific chunking preferences (overrides defaults when provided)
const TOOL_CHUNK_CONFIG = Object.entries(TRANSCRIPTION_CONFIG).reduce((acc, [toolName, toolConfig]) => {
  const chunking = toolConfig.chunking || {};
  acc[toolName] = {
    format: chunking.format || CHUNK_CONFIG.format,
    maxDuration: chunking.maxDuration || CHUNK_CONFIG.maxDuration,
    maxFileSize: chunking.maxFileSize || Infinity,
    audioCodec: chunking.audioCodec || null,
    audioBitrate: chunking.audioBitrate || null,
    audioChannels: chunking.audioChannels ?? CHUNK_CONFIG.audioChannels ?? null,
    minSplitDuration: chunking.minSplitDuration || CHUNK_CONFIG.minSplitDuration,
    sampleRate: chunking.sampleRate || CHUNK_CONFIG.sampleRate
  };
  return acc;
}, {});

// Diagnostics helpers
const TRANSCRIPTION_DIAGNOSTICS_ENABLED = process.env.TRANSCRIPTION_DEBUG !== 'false';
const bytesToMB = (bytes = 0) => Number((bytes / (1024 * 1024)).toFixed(1));

const getProcessMetrics = () => {
  const memoryUsage = process.memoryUsage();
  const metrics = {
    memoryMB: {
      rss: bytesToMB(memoryUsage.rss),
      heapTotal: bytesToMB(memoryUsage.heapTotal),
      heapUsed: bytesToMB(memoryUsage.heapUsed),
      external: bytesToMB(memoryUsage.external),
      arrayBuffers: bytesToMB(memoryUsage.arrayBuffers || 0)
    },
    uptimeSeconds: Number(process.uptime().toFixed(1))
  };

  if (typeof process._getActiveHandles === 'function') {
    metrics.activeHandles = process._getActiveHandles().length;
  }
  if (typeof process._getActiveRequests === 'function') {
    metrics.activeRequests = process._getActiveRequests().length;
  }

  return metrics;
};

const logTranscriptionDiagnostic = (stage, details = {}) => {
  if (!TRANSCRIPTION_DIAGNOSTICS_ENABLED) {
    return;
  }
  console.log(`[Transcription Diagnostics] ${stage}`, {
    ...details,
    metrics: getProcessMetrics()
  });
};

// Initialize clients
const openAIClient = new OpenAI({ apiKey: TRANSCRIPTION_CONFIG.openai.apiKey });
// AssemblyAI client removed - using direct API calls
const googleSpeechClient = new SpeechClient({
  keyFilename: config.transcriptionConfig.googleKeyPath
});

// AssemblyAI API endpoints
const ASSEMBLYAI_API_BASE = 'https://api.assemblyai.com/v2';

// Ensure upload directory exists
if (!fsSync.existsSync(uploadDir)) {
  fsSync.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Main entry point for transcription with fallback mechanism
 */
const requestTranscription = async (file, recordingId, options = {}) => {
  // Track active transcription to prevent shutdown - use finally to ensure cleanup
  transcriptionState.add(recordingId);
  
  try {
    const {
      preferredTool = config.transcriptionConfig.default || 'openai',
      enableFallback = true,
      maxAttempts = 3,
      onChunkProgress
    } = options;

    const filePath = file.path || (file.filename ? path.join(uploadDir, file.filename) : null);
    if (!filePath) {
      throw new Error('Audio file path is required for transcription.');
    }

    let fileUrl =
      file.cloudStorageUrl ||
      file.fileUrl ||
      (file.filename && config.APP_URL ? `${config.APP_URL}/files/${file.filename}` : null);
    
    if (!fileUrl && file.cloudStorageObject) {
      try {
        fileUrl = await generateSignedReadUrl(file.cloudStorageObject, 3600);
        console.log(`[Signed URL] Generated for recording ${recordingId}`);
      } catch (err) {
        console.error('[Signed URL] Failed to generate signed URL:', err.message);
      }
    }

    if (!fileUrl && process.env.NODE_ENV === 'development') {
      fileUrl = `https://drive.google.com/uc?export=download&id=1aTdDS9oGf80MbG2kicOlEKqEcA_Do47i`;
    }

    // Get file duration
    const duration = await getAudioDuration(filePath);
    const needsBatching = duration > CHUNK_CONFIG.maxDuration;
    // Determine transcription strategy
    const toolOrder = getToolExecutionOrder(preferredTool);
    logTranscriptionDiagnostic('request:start', {
      recordingId,
      preferredTool,
      toolOrder,
      durationSeconds: duration,
      needsBatching,
      filePath
    });
    
    let lastError = null;
    let attemptCount = 0;

    // Track which tools were actually attempted and their job IDs
    const attemptedTools = [];
    const toolJobIds = {}; // Map of tool name to job ID
    
    for (const toolName of toolOrder) {
      if (attemptCount >= maxAttempts) break;
      
      try {
      logTranscriptionDiagnostic('request:attempt', {
        recordingId,
        toolName,
        attemptNumber: attemptCount + 1,
        needsBatching,
        enableFallback
      });
      console.log(`[Attempt ${attemptCount + 1}] Trying ${toolName} for recording ${recordingId}`);
      
      let result;
      let jobId = null;
      
      // For Google: Use LongRunningRecognize with GCS URI if available (supports long audio without chunking)
      const useGoogleLongRunning = toolName === 'google' && 
        (file.cloudStorageObject || file.gcsUri || fileUrl?.startsWith('gs://'));
      
      if (useGoogleLongRunning) {
        console.log(`[Google] Using LongRunningRecognize with GCS URI for long audio file`);
        result = await transcribeWithTool(
          toolName, 
          filePath, 
          fileUrl, 
          recordingId,
          { cloudStorageObject: file.cloudStorageObject, gcsUri: file.gcsUri || fileUrl }
        );
        // Google doesn't return a job ID in the same way, but we can track operation name if available
        jobId = result.transcriptionMetadata?.operationName || null;
      } else if (needsBatching && TRANSCRIPTION_CONFIG[toolName].supports.batch) {
        console.log(`Audio duration (${duration}s) exceeds limit. Using batch processing.`);
        result = await transcribeInBatches(filePath, recordingId, toolName, {
          onChunkProgress,
          resumeFromChunk: options.resumeFromChunk,
          existingResults: options.existingResults
        });
        // Batch processing doesn't have a single job ID, but we can track it
        jobId = result.transcriptionMetadata?.jobId || null;
      } else {
        result = await transcribeWithTool(
          toolName, 
          filePath, 
          fileUrl, 
          recordingId,
          { cloudStorageObject: file.cloudStorageObject, gcsUri: file.gcsUri }
        );
        // Extract job ID from result metadata
        jobId = result.transcriptionMetadata?.jobId || null;
      }
      
      // Track successful tool attempt
      attemptedTools.push(toolName);
      if (jobId) {
        toolJobIds[toolName] = jobId;
      }
      
      // Add metadata about which tool was used and attempt number
      result.transcriptionMetadata = {
        ...result.transcriptionMetadata,
        attemptNumber: attemptCount + 1,
        toolsAttempted: attemptedTools,
        batchProcessed: needsBatching
      };
      
      console.log(`✓ Successfully transcribed with ${toolName}${jobId ? ` (job ID: ${jobId})` : ''}`);
      return result;
      
    } catch (error) {
      // Track which tool actually failed (not just the preferred tool)
      attemptedTools.push(toolName);
      lastError = error;
      attemptCount++;
      
      // Extract job ID from error if available (for async jobs that might have started)
      let jobId = null;
      if (error.jobId) {
        jobId = error.jobId;
        toolJobIds[toolName] = jobId;
      }
      
      console.error(`✗ ${toolName} failed (attempt ${attemptCount})${jobId ? ` (job ID: ${jobId})` : ''}:`, error.message);
      logTranscriptionDiagnostic('request:attempt-error', {
        recordingId,
        toolName,
        attemptNumber: attemptCount,
        errorMessage: error.message,
        jobId
      });
      
      // Log failure for monitoring
      await logTranscriptionAttempt({
        recordingId,
        tool: toolName,
        attemptNumber: attemptCount,
        success: false,
        error: error.message,
        duration: duration,
        jobId: jobId
      });
      
      // Enhance error with tool information for better debugging
      error.failedTool = toolName;
      error.attemptedTools = [...attemptedTools];
      error.jobId = jobId;
      
      if (!enableFallback) break;
      
      // Wait before next attempt (exponential backoff)
      if (attemptCount < maxAttempts) {
        const backoffMs = Math.min(1000 * Math.pow(2, attemptCount), 10000);
        console.log(`Waiting ${backoffMs}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
  
    // All attempts failed - create error with information about all attempted tools
    const errorMessage = `All transcription attempts failed. Tools attempted: ${attemptedTools.join(', ')}. Last error (from ${lastError?.failedTool || 'unknown'}): ${lastError?.message || 'Unknown error'}`;
    const finalError = new Error(errorMessage);
    logTranscriptionDiagnostic('request:failed', {
      recordingId,
      attemptedTools,
      lastError: lastError?.message,
      jobIds: toolJobIds
    });
    finalError.failedTool = lastError?.failedTool || attemptedTools[attemptedTools.length - 1] || 'unknown';
    finalError.attemptedTools = attemptedTools;
    finalError.toolJobIds = toolJobIds;
    throw finalError;
  } finally {
    // Always remove from state tracker when transcription completes or fails
    transcriptionState.remove(recordingId);
  }
};

/**
 * Get ordered list of tools to try based on priority
 */
function getToolExecutionOrder(preferredTool) {
  const tools = Object.entries(TRANSCRIPTION_CONFIG)
    .sort((a, b) => {
      // Preferred tool goes first
      if (a[0] === preferredTool) return -1;
      if (b[0] === preferredTool) return 1;
      // Then sort by priority
      return a[1].priority - b[1].priority;
    })
    .map(([name]) => name);
  
  return tools;
}

/**
 * Transcribe with a specific tool
 */
async function transcribeWithTool(toolName, filePath, fileUrl, recordingId, options = {}) {
  const cloudStorageObject = options?.cloudStorageObject;
  
  // Tools that require public HTTPS URLs (not signed URLs or gs:// URIs)
  const requiresPublicUrl = ['assemblyai', 'salad'];
  
  // If we have a cloud storage object and the tool requires public URL
  if (cloudStorageObject && requiresPublicUrl.includes(toolName)) {
    // Check if we already have a valid HTTPS URL (public or signed)
    // If fileUrl is already an HTTPS URL, use it directly instead of trying to make it public again
    if (fileUrl && fileUrl.startsWith('https://')) {
      console.log(`[${toolName}] Using existing HTTPS URL for transcription`);
      switch (toolName) {
        case 'assemblyai':
          const assemblyAIData = await assemblyAITranscribeAudioService(filePath, fileUrl, recordingId);
          return await formatTranscriptResponseFromTool(assemblyAIData, 'assemblyai');
          
        case 'salad':
          const saladData = await saladTranscribeAudioService(fileUrl, recordingId);
          return await formatTranscriptResponseFromTool(saladData, 'salad');
          
        default:
          throw new Error(`Tool ${toolName} should not require public URL`);
      }
    }
    
    // If we don't have an HTTPS URL (e.g., only have gs:// URI), try to make it accessible
    console.log(`[${toolName}] Making file temporarily public for transcription`);
    try {
      return await withTemporaryPublicAccess(
        cloudStorageObject,
        async (publicUrl) => {
          switch (toolName) {
            case 'assemblyai':
              const assemblyAIData = await assemblyAITranscribeAudioService(filePath, publicUrl, recordingId);
              return await formatTranscriptResponseFromTool(assemblyAIData, 'assemblyai');
              
            case 'salad':
              const saladData = await saladTranscribeAudioService(publicUrl, recordingId);
              return await formatTranscriptResponseFromTool(saladData, 'salad');
            
            default:
              throw new Error(`Tool ${toolName} should not require public URL`);
          }
        }
      );
    } catch (urlError) {
      // If we can't generate a public URL (e.g., credentials not configured),
      // fall back to direct file upload for tools that support it
      if (toolName === 'assemblyai') {
        console.warn(`[${toolName}] Failed to generate GCS URL (${urlError.message}), falling back to direct file upload`);
        // AssemblyAI supports direct file upload when fileUrl is null/undefined
        const assemblyAIData = await assemblyAITranscribeAudioService(filePath, null, recordingId);
        return await formatTranscriptResponseFromTool(assemblyAIData, 'assemblyai');
      }
      // For other tools that require URLs, re-throw the error
      throw urlError;
    }
  }
  
  // For Google: use signed URL or GCS URI (Google accepts both)
  // For OpenAI: use file path directly (no URL needed)
  // For other tools without cloud storage: use existing fileUrl
  switch (toolName) {
    case 'openai':
      const openAIData = await openaiTranscribeAudioService(filePath, [], fileUrl, recordingId);
      return await formatTranscriptResponseFromTool(openAIData, 'openai');
      
    case 'assemblyai':
      const assemblyAIData = await assemblyAITranscribeAudioService(filePath, fileUrl, recordingId);
      return await formatTranscriptResponseFromTool(assemblyAIData, 'assemblyai');
      
    case 'google':
      // Google can use signed URLs or GCS URIs
      const googleData = await googleTranscribeAudioService(
        filePath, 
        fileUrl, 
        recordingId,
        options?.cloudStorageObject || options?.gcsUri
      );
      return await formatTranscriptResponseFromTool(googleData, 'google');
      
    case 'salad':
      const saladData = await saladTranscribeAudioService(fileUrl, recordingId);
      return await formatTranscriptResponseFromTool(saladData, 'salad');
      
    default:
      throw new Error(`Unsupported transcription tool: ${toolName}`);
  }
}

/**
 * Convert audio file to a specific format
 */
async function convertAudioFormat(inputPath, outputPath, targetFormat, options = {}) {
  const {
    audioCodec = null,
    audioBitrate = null,
    audioChannels = null,
    sampleRate = 16000
  } = options;

  return new Promise((resolve, reject) => {
    const ffmpegCommand = ffmpeg(inputPath)
      .audioFrequency(sampleRate);
    
    if (audioChannels) {
      ffmpegCommand.audioChannels(audioChannels);
    }
    
    if (audioCodec) {
      ffmpegCommand.audioCodec(audioCodec);
    }
    
    if (audioBitrate) {
      ffmpegCommand.audioBitrate(audioBitrate);
    }
    
    ffmpegCommand.toFormat(targetFormat);
    
    ffmpegCommand
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
}

/**
 * Delete a directory and all its contents recursively
 */
async function deleteDirectory(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await deleteDirectory(fullPath);
      } else {
        await fs.unlink(fullPath);
      }
    }
    
    await fs.rmdir(dirPath);
    console.log(`[Cleanup] Deleted directory: ${dirPath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[Cleanup] Failed to delete directory ${dirPath}:`, error.message);
    }
  }
}

/**
 * Ensure chunk workspace is outside the watched project tree
 */
async function prepareChunkWorkspace(recordingId, sourceFilePath) {
  await fs.mkdir(chunkWorkspaceRoot, { recursive: true });
  const safeRecordingId = (recordingId && recordingId.toString && recordingId.toString()) ||
    path.basename(sourceFilePath, path.extname(sourceFilePath)) ||
    `recapp_${Date.now()}`;
  const sanitizedRecordingId = safeRecordingId.replace(/[^a-zA-Z0-9-_]/g, '_');
  const workspaceName = `${sanitizedRecordingId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const workspaceDir = path.join(chunkWorkspaceRoot, workspaceName);
  await fs.mkdir(workspaceDir, { recursive: true });

  if (!chunkWorkspaceRootLogged) {
    console.log(`[Chunk Workspace] Root directory: ${chunkWorkspaceRoot}`);
    chunkWorkspaceRootLogged = true;
  }

  const projectRoot = path.resolve(__dirname, '..', '..');
  if (!chunkWorkspaceWarningLogged && workspaceDir.startsWith(projectRoot)) {
    console.warn('[Chunk Workspace] Workspace is inside the project directory. ' +
      'If you run PM2/nodemon with --watch this will trigger restarts. ' +
      'Set CHUNK_WORKSPACE_DIR to a location outside the repository (e.g. /tmp/recapp-chunks).');
    chunkWorkspaceWarningLogged = true;
  }

  console.log(`[Chunk Workspace] Using workspace at ${workspaceDir}`);
  logTranscriptionDiagnostic('chunking:workspace', {
    recordingId,
    chunkDir: workspaceDir,
    sourceFile: sourceFilePath
  });

  return workspaceDir;
}

/**
 * Batch processing for long audio files
 * @param {string} filePath - Path to audio file
 * @param {string} recordingId - Recording ID
 * @param {string} toolName - Transcription tool name
 * @param {Object} options - Options including resumeFromChunk for resuming
 */
async function transcribeInBatches(filePath, recordingId, toolName, options = {}) {
  const { resumeFromChunk = 0, existingResults = [] } = options;
  
  // Always create chunks in common format (wav) first
  const chunks = await splitAudioIntoChunks(filePath, 'default', recordingId);
  const chunkDir = chunks.length > 0 ? path.dirname(chunks[0].filePath) : null;
  const results = [...existingResults]; // Start with existing results if resuming
  const uploadedChunks = []; // Track chunks uploaded to GCS for cleanup
  const totalChunkSizeMB = chunks.reduce((acc, chunk) => acc + (chunk.sizeMB || 0), 0);
  
  const isResuming = resumeFromChunk > 0 || existingResults.length > 0;
  if (isResuming) {
    console.log(`[Batch Processing] RESUMING from chunk ${resumeFromChunk}/${chunks.length} for recording ${recordingId}`);
    console.log(`[Batch Processing] Already completed: ${existingResults.length} chunks`);
  }
  
  logTranscriptionDiagnostic('batch:chunks-prepared', {
    recordingId,
    toolName,
    chunkCount: chunks.length,
    totalChunkDuration: chunks.length ? chunks[chunks.length - 1].endTime : 0,
    totalChunkSizeMB: Number(totalChunkSizeMB.toFixed(2)),
    resuming: isResuming,
    resumeFromChunk
  });
  
  // Get tool-specific format requirements
  const toolChunkConfig = TOOL_CHUNK_CONFIG[toolName] || {};
  const toolFormat = toolChunkConfig.format || 'wav';
  const needsConversion = toolFormat !== 'wav';
  
  // Tools that can use GCS public URLs (skip AssemblyAI upload API)
  const canUseGCSUrl = ['assemblyai', 'salad'];
  const useGCSForChunks = canUseGCSUrl.includes(toolName);
  
  console.log(`[Batch Processing] Starting batch transcription for recording ${recordingId}`);
  console.log(`[Batch Processing] Total chunks: ${chunks.length}, Tool: ${toolName}, Use GCS: ${useGCSForChunks}`);
  
  try {
    // Start from resumeFromChunk if resuming
    for (let i = resumeFromChunk; i < chunks.length; i++) {
      const chunk = chunks[i];
      const sizeInfo = chunk.sizeMB ? ` (${chunk.sizeMB.toFixed(2)} MB)` : '';
      const chunkStartTime = Date.now();
      logTranscriptionDiagnostic('batch:chunk-start', {
        recordingId,
        toolName,
        chunkIndex: i,
        chunkRange: `${chunk.startTime}-${chunk.endTime}`,
        chunkSizeMB: chunk.sizeMB
      });
      
      console.log(`[Batch Processing] Processing chunk ${i + 1}/${chunks.length} (${chunk.startTime}s - ${chunk.endTime}s)${sizeInfo}`);
      
      let chunkFilePath = chunk.filePath;
      let convertedFilePath = null;
      let needsCleanup = false;
      let chunkGCSObject = null;
      let chunkPublicUrl = null;
      
      try {
        // Convert to tool-specific format if needed
        if (needsConversion) {
          const basePath = path.dirname(chunk.filePath);
          const baseName = path.basename(chunk.filePath, path.extname(chunk.filePath));
          convertedFilePath = path.join(basePath, `${baseName}_${toolFormat}.${toolFormat}`);
          
          console.log(`[Batch Processing] Converting chunk ${i} from wav to ${toolFormat}...`);
          try {
            await convertAudioFormat(
              chunk.filePath,
              convertedFilePath,
              toolFormat,
              {
                audioCodec: toolChunkConfig.audioCodec,
                audioBitrate: toolChunkConfig.audioBitrate,
                audioChannels: toolChunkConfig.audioChannels,
                sampleRate: toolChunkConfig.sampleRate
              }
            );
            chunkFilePath = convertedFilePath;
            needsCleanup = true;
            console.log(`[Batch Processing] Chunk ${i} converted successfully`);
          } catch (convertError) {
            console.error(`[Batch Processing] Failed to convert chunk ${i}:`, convertError.message);
            throw new Error(`Format conversion failed for chunk ${i}: ${convertError.message}`);
          }
        }
        
        // Upload chunk to GCS if tool supports it (skip AssemblyAI upload API)
        if (useGCSForChunks) {
          try {
            console.log(`[Batch Processing] Uploading chunk ${i} to GCS for ${toolName}...`);
            const uploadResult = await uploadChunkToBucket({
              localPath: chunkFilePath,
              recordingId: recordingId,
              chunkIndex: i,
              filename: path.basename(chunkFilePath),
              mimetype: `audio/${toolFormat}`,
              makePublic: true
            });
            
            chunkGCSObject = uploadResult.objectName;
            chunkPublicUrl = uploadResult.publicUrl;
            uploadedChunks.push({ objectName: chunkGCSObject, chunkIndex: i });
            
            console.log(`[Batch Processing] Chunk ${i} uploaded to GCS successfully`);
          } catch (uploadError) {
            console.error(`[Batch Processing] Failed to upload chunk ${i} to GCS:`, uploadError.message);
            // Fallback to direct upload if GCS upload fails
            console.log(`[Batch Processing] Falling back to direct upload for chunk ${i}...`);
            chunkPublicUrl = null;
          }
        }
        
        // Transcribe chunk
        console.log(`[Batch Processing] Starting transcription for chunk ${i}...`);
        try {
          const chunkResult = await transcribeWithTool(
            toolName,
            chunkFilePath,
            chunkPublicUrl, // Use GCS public URL if available
            `${recordingId}_chunk_${i}`,
            { 
              cloudStorageObject: chunkGCSObject,
              gcsUri: chunkGCSObject ? `gs://${config.googleCloudStorage?.bucketName}/${chunkGCSObject}` : null
            }
          );
          
          const chunkDuration = Date.now() - chunkStartTime;
          console.log(`[Batch Processing] Chunk ${i} transcribed successfully in ${chunkDuration}ms`);
          
          results.push({
            ...chunkResult,
            chunkIndex: i,
            startTime: chunk.startTime,
            endTime: chunk.endTime
          });
          logTranscriptionDiagnostic('batch:chunk-complete', {
            recordingId,
            toolName,
            chunkIndex: i,
            durationMs: chunkDuration
          });

          if (options?.onChunkProgress) {
            try {
              await options.onChunkProgress({
                recordingId,
                toolName,
                chunkResult,
                chunk,
                chunkIndex: i,
                totalChunks: chunks.length
              });
            } catch (progressError) {
              console.error(`[Batch Processing] Failed to update chunk progress for chunk ${i}:`, progressError.message);
              // Don't fail the whole process if progress update fails
            }
          }
        } catch (transcribeError) {
          console.error(`[Batch Processing] Transcription failed for chunk ${i}:`, {
            message: transcribeError.message,
            stack: transcribeError.stack,
            chunkIndex: i,
            recordingId
          });
          throw transcribeError;
        }
        
        // Clean up converted file if we created one
        if (needsCleanup && convertedFilePath) {
          await fs.unlink(convertedFilePath).catch(err => 
            console.error(`[Batch Processing] Failed to delete converted chunk ${i}:`, err.message)
          );
        }
        
        // Revoke public access for chunk if it was uploaded to GCS
        if (chunkGCSObject) {
          try {
            await makeFilePrivateIAM(chunkGCSObject);
            console.log(`[Batch Processing] Revoked public access for chunk ${i}`);
          } catch (revokeError) {
            console.error(`[Batch Processing] Failed to revoke public access for chunk ${i}:`, revokeError.message);
            // Don't fail if we can't revoke access
          }
        }
        
      } catch (error) {
        console.error(`[Batch Processing] Chunk ${i} processing failed:`, {
          message: error.message,
          stack: error.stack,
          chunkIndex: i,
          recordingId,
          chunkFilePath,
          convertedFilePath
        });
        logTranscriptionDiagnostic('batch:chunk-error', {
          recordingId,
          toolName,
          chunkIndex: i,
          errorMessage: error.message
        });
        
        // Clean up converted file on error
        if (needsCleanup && convertedFilePath) {
          await fs.unlink(convertedFilePath).catch(() => {});
        }
        
        // Revoke public access if chunk was uploaded
        if (chunkGCSObject) {
          await makeFilePrivateIAM(chunkGCSObject).catch(() => {});
        }
        
        throw new Error(`Batch processing failed at chunk ${i}: ${error.message}`);
      }
    }
    
    console.log(`[Batch Processing] All ${chunks.length} chunks processed successfully`);
    logTranscriptionDiagnostic('batch:complete', {
      recordingId,
      toolName,
      chunkCount: chunks.length
    });
    
    // Merge results
    return mergeChunkResults(results);
  } catch (error) {
    console.error(`[Batch Processing] Batch processing failed:`, {
      message: error.message,
      stack: error.stack,
      recordingId,
      processedChunks: results.length,
      totalChunks: chunks.length
    });
    logTranscriptionDiagnostic('batch:failed', {
      recordingId,
      toolName,
      processedChunks: results.length,
      totalChunks: chunks.length,
      errorMessage: error.message
    });
    throw error;
  } finally {
    // Clean up uploaded chunks from GCS
    for (const uploadedChunk of uploadedChunks) {
      try {
        await makeFilePrivateIAM(uploadedChunk.objectName);
      } catch (err) {
        console.error(`[Batch Processing] Failed to revoke access for chunk ${uploadedChunk.chunkIndex}:`, err.message);
      }
    }
    
    // Always clean up all chunks and chunk directory, even on error
    console.log(`[Batch Processing] Cleaning up ${chunks.length} chunk files and directory...`);
    logTranscriptionDiagnostic('batch:cleanup', {
      recordingId,
      toolName,
      chunkCount: chunks.length
    });
    
    // Delete all chunk files
    for (const chunk of chunks) {
      await fs.unlink(chunk.filePath).catch(err => {
        if (err.code !== 'ENOENT') {
          console.error(`[Batch Processing] Failed to delete chunk file ${chunk.filePath}:`, err.message);
        }
      });
    }
    
    // Delete the entire chunk directory
    if (chunkDir) {
      await deleteDirectory(chunkDir);
    }
    
    console.log(`[Batch Processing] Cleanup completed`);
  }
}

/**
 * Split audio file into chunks using ffmpeg
 * Always creates chunks in common format (wav) - tool-specific formats are created on-demand
 * @param {string} filePath - Path to the audio file
 * @param {string} toolName - Name of the transcription tool (unused, kept for compatibility)
 */
async function splitAudioIntoChunks(filePath, toolName = 'default', recordingId = null) {
  const duration = await getAudioDuration(filePath);
  const chunks = [];
  const chunkDir = await prepareChunkWorkspace(recordingId, filePath);
  
  // Always use common format (wav) for initial chunking
  const format = CHUNK_CONFIG.format; // Always 'wav'
  const maxChunkDuration = CHUNK_CONFIG.maxDuration;
  const sampleRate = CHUNK_CONFIG.sampleRate;
  const audioChannels = CHUNK_CONFIG.audioChannels;
  
  // Use the most restrictive maxFileSize across all tools (for OpenAI: 25MB)
  const maxFileSize = TRANSCRIPTION_CONFIG.openai?.chunking?.maxFileSize || 25 * 1024 * 1024;
  const minSplitDuration = CHUNK_CONFIG.minSplitDuration;
  
  let startTime = 0;
  let chunkIndex = 0;
  
  while (startTime < duration) {
    const endTime = Math.min(startTime + maxChunkDuration, duration);
    const chunkPath = path.join(chunkDir, `chunk_${chunkIndex}.${format}`);
    
    await new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg(filePath)
        .setStartTime(startTime)
        .setDuration(endTime - startTime)
        .audioFrequency(sampleRate);
      
      if (audioChannels) {
        ffmpegCommand.audioChannels(audioChannels);
      }
      
      // Use wav format (no codec/bitrate needed for wav)
      ffmpegCommand.toFormat(format);
      
      ffmpegCommand
        .on('end', resolve)
        .on('error', reject)
        .save(chunkPath);
    });
    
    // Check file size and split further if needed
    const chunkStats = await fs.stat(chunkPath);
    const chunkSizeMB = chunkStats.size / 1024 / 1024;
    
    if (chunkStats.size > maxFileSize) {
      console.log(`[Chunking] Chunk ${chunkIndex} is ${chunkSizeMB.toFixed(2)} MB, splitting further...`);
      
      // Delete the oversized chunk
      await fs.unlink(chunkPath);
      
      // Split this chunk into smaller pieces (always in wav format)
      const subChunks = await splitChunkFurther({
        filePath,
        startTime,
        endTime,
        chunkDir,
        baseIndex: chunkIndex,
        format: 'wav', // Always wav
        maxFileSize,
        audioCodec: null, // No codec for wav
        audioBitrate: null, // No bitrate for wav
        audioChannels,
        sampleRate,
        minSplitDuration
      });
      chunks.push(...subChunks);
      chunkIndex += subChunks.length;
    } else {
      chunks.push({
        filePath: chunkPath,
        startTime,
        endTime,
        duration: endTime - startTime,
        index: chunkIndex,
        sizeMB: chunkSizeMB
      });
      chunkIndex++;
    }
    
    if (endTime >= duration) {
      break;
    }

    // Overlap for context continuity (ensure non-negative start)
    startTime = Math.max(0, endTime - CHUNK_CONFIG.overlap);
  }
  
  console.log(`[Chunking] Created ${chunks.length} chunks in common format (${format})`);
  return chunks;
}

/**
 * Split a chunk further if it's too large
 * Always uses wav format for sub-chunks
 */
async function splitChunkFurther(options) {
  const {
    filePath,
    startTime,
    endTime,
    chunkDir,
    baseIndex,
    format = 'wav', // Always wav
    maxFileSize,
    audioCodec = null, // No codec for wav
    audioBitrate = null, // No bitrate for wav
    audioChannels,
    sampleRate = CHUNK_CONFIG.sampleRate,
    minSplitDuration = 60
  } = options;
  const subChunks = [];
  const chunkDuration = endTime - startTime;
  const subChunkDuration = Math.floor(chunkDuration / 2); // Split in half
  
  let currentStart = startTime;
  let subIndex = 0;
  
  while (currentStart < endTime) {
    const currentEnd = Math.min(currentStart + subChunkDuration, endTime);
    const subChunkPath = path.join(chunkDir, `chunk_${baseIndex}_sub_${subIndex}.${format}`);
    
    await new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg(filePath)
        .setStartTime(currentStart)
        .setDuration(currentEnd - currentStart)
        .audioFrequency(sampleRate);
      
      if (audioChannels) {
        ffmpegCommand.audioChannels(audioChannels);
      }
      
      // No codec/bitrate for wav format
      ffmpegCommand.toFormat(format);
      
      ffmpegCommand
        .on('end', resolve)
        .on('error', reject)
        .save(subChunkPath);
    });
    
    const subChunkStats = await fs.stat(subChunkPath);
    const subChunkSizeMB = subChunkStats.size / 1024 / 1024;
    
    // If still too large, recurse (but limit recursion depth)
    if (subChunkStats.size > maxFileSize && (currentEnd - currentStart) > minSplitDuration) {
      await fs.unlink(subChunkPath);
      const deeperChunks = await splitChunkFurther({
        filePath,
        startTime: currentStart,
        endTime: currentEnd,
        chunkDir,
        baseIndex: `${baseIndex}_sub_${subIndex}`,
        format: 'wav', // Always wav
        maxFileSize,
        audioCodec: null,
        audioBitrate: null,
        audioChannels,
        sampleRate,
        minSplitDuration
      });
      subChunks.push(...deeperChunks);
    } else {
      subChunks.push({
        filePath: subChunkPath,
        startTime: currentStart,
        endTime: currentEnd,
        duration: currentEnd - currentStart,
        index: `${baseIndex}_sub_${subIndex}`,
        sizeMB: subChunkSizeMB
      });
    }
    
    currentStart = currentEnd;
    subIndex++;
  }
  
  return subChunks;
}

/**
 * Merge transcription results from multiple chunks
 */
function mergeChunkResults(chunkResults) {
  // Sort by start time to handle sub-chunks properly
  chunkResults.sort((a, b) => a.startTime - b.startTime);
  
  let mergedText = '';
  let allTimestamps = [];
  let allSpeakerLabels = [];
  let totalDuration = 0;
  
  chunkResults.forEach((result, index) => {
    const offset = result.startTime;
    
    // Merge text (remove overlap duplicates)
    if (index > 0) {
      // Simple approach: just concatenate with space
      mergedText += ' ' + result.transcriptionText;
    } else {
      mergedText = result.transcriptionText;
    }
    
    // Adjust timestamps
    if (result.transcriptionMetadata?.timestamps) {
      const adjustedTimestamps = result.transcriptionMetadata.timestamps.map(ts => ({
        ...ts,
        start: ts.start + offset,
        end: ts.end + offset
      }));
      allTimestamps.push(...adjustedTimestamps);
    }
    
    // Adjust speaker labels
    if (result.transcriptionMetadata?.speakerLabels) {
      const adjustedLabels = result.transcriptionMetadata.speakerLabels.map(label => ({
        ...label,
        startTime: label.startTime + offset,
        endTime: label.endTime + offset
      }));
      allSpeakerLabels.push(...adjustedLabels);
    }
    
    totalDuration = Math.max(totalDuration, result.endTime);
  });
  
  return {
    transcriptionText: mergedText.trim(),
    transcriptionStatus: 'completed',
    duration: totalDuration,
    transcriptionMetadata: {
      ...chunkResults[0].transcriptionMetadata,
      timestamps: allTimestamps,
      speakerLabels: allSpeakerLabels,
      chunkCount: chunkResults.length,
      batchProcessed: true
    }
  };
}

/**
 * Get audio duration using ffmpeg
 */
function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration);
    });
  });
}

/**
 * Google Speech-to-Text implementation
 * Uses LongRunningRecognize with GCS URI for long audio files (>60s or when GCS URI available)
 * Falls back to sync recognize for short audio files
 */
async function googleTranscribeAudioService(filePath, fileUrl, recordingId, gcsUriOrObjectName = null) {
  const fileExt = path.extname(filePath).toLowerCase();
  const encodingMap = TRANSCRIPTION_CONFIG.google.constraints?.encodings || {};
  let encoding = encodingMap[fileExt] || 'LINEAR16';
  
  // Build GCS URI if we have object name
  let gcsUri = gcsUriOrObjectName;
  if (gcsUriOrObjectName && !gcsUriOrObjectName.startsWith('gs://')) {
    const bucketName = config.googleCloudStorage?.bucketName;
    if (bucketName) {
      gcsUri = `gs://${bucketName}/${gcsUriOrObjectName}`;
    }
  }
  
  // Also check if fileUrl is already a gs:// URI
  if (!gcsUri && fileUrl && fileUrl.startsWith('gs://')) {
    gcsUri = fileUrl;
  }
  
  // Get audio duration to decide which API to use
  const duration = await getAudioDuration(filePath);
  const useLongRunning = duration > 60 || gcsUri; // Use LongRunningRecognize for >60s or when GCS URI available
  
  const recognitionConfig = {
    encoding,
    sampleRateHertz: 16000,
    languageCode: 'en-US',
    alternativeLanguageCodes: ['hi-IN', 'kn-IN', 'ml-IN', 'ta-IN', 'te-IN'],
    enableAutomaticPunctuation: true,
    enableWordTimeOffsets: true,
    enableSpeakerDiarization: true,
    diarizationSpeakerCount: 2,
    model: 'latest_long',
  };
  
  if (useLongRunning && gcsUri) {
    console.log(`[Google] Using LongRunningRecognize with GCS URI: ${gcsUri}`);
    
    // Use LongRunningRecognize with GCS URI
    const request = {
      config: recognitionConfig,
      audio: {
        uri: gcsUri
      }
    };
    
    // Start long-running operation
    const [operation] = await googleSpeechClient.longRunningRecognize(request);
    console.log(`[Google] Long-running operation started: ${operation.name}`);
    
    // Wait for the operation to complete
    // The operation.promise() method handles polling internally
    const timeout = TRANSCRIPTION_CONFIG.google.timeout || 600000; // 10 minutes for long audio
    
    try {
      const [response] = await Promise.race([
        operation.promise(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Operation timeout')), timeout)
        )
      ]);
      
      if (response.error) {
        throw new Error(`Google LongRunningRecognize failed: ${response.error.message}`);
      }
      
      return {
        results: response.results || [],
        duration: response.totalBilledTime || duration
      };
    } catch (error) {
      if (error.message === 'Operation timeout') {
        throw new Error(`Google LongRunningRecognize timed out after ${timeout}ms`);
      }
      throw error;
    }
  } else {
    // Use sync recognize for short audio files
    console.log(`[Google] Using sync recognize API (duration: ${duration}s)`);
    
    const audioBytes = await fs.readFile(filePath);
    const audio = {
      content: audioBytes.toString('base64'),
    };
    
    const request = {
      audio: audio,
      config: recognitionConfig,
    };
    
    const [response] = await googleSpeechClient.recognize(request);
    
    return {
      results: response.results,
      duration: response.totalBilledTime || duration
    };
  }
}

/**
 * Format Google transcription response
 */
async function googleFormat(transcriptData) {
  if (!transcriptData?.results) {
    throw new Error("Failed to get transcription data from Google");
  }
  
  let speakerSentences = '';
  let currentSpeaker = '';
  let timeStamps = [];
  let speakerLabels = [];
  
  transcriptData.results.forEach(result => {
    const alternative = result.alternatives[0];
    const words = alternative.words || [];
    
    words.forEach(wordInfo => {
      const speaker = wordInfo.speakerTag || 'SPEAKER_0';
      const word = wordInfo.word;
      const startTime = wordInfo.startTime?.seconds || 0;
      const endTime = wordInfo.endTime?.seconds || 0;
      
      if (currentSpeaker !== speaker) {
        currentSpeaker = speaker;
        speakerSentences += `\n ${speaker}: `;
      }
      
      speakerSentences += `${word} `;
      
      timeStamps.push({
        text: word,
        start: startTime,
        end: endTime
      });
    });
    
    speakerLabels.push({
      speaker: currentSpeaker,
      text: alternative.transcript,
      confidence: alternative.confidence
    });
  });
  
  return {
    transcriptionText: speakerSentences.trim(),
    transcriptionStatus: 'completed',
    duration: transcriptData.duration,
    transcriptionMetadata: {
      provider: 'google',
      model: 'latest_long',
      language: 'en',
      confidence: transcriptData.results[0]?.alternatives[0]?.confidence,
      timestamps: timeStamps,
      speakerLabels: speakerLabels,
      processedAt: new Date()
    }
  };
}

/**
 * Transcribes an audio file using OpenAI's transcription API.
 * @param {string} audioFile - The path to the audio file to be transcribed.
 * @param {Array<string>} [speakerNames=[]] - Optional array of known speaker names.
 * @returns {Promise<Object>} The transcription result from OpenAI.
 */
const openaiTranscribeAudioService = async (audioFile, speakerNames = [], fileUrl = null, recordingId) => {
    let modelName = "gpt-4o-transcribe-diarize"; // Default model name
  
    // Verify file exists
    if (!fsSync.existsSync(audioFile)) {
        throw new Error(`Audio file not found: ${audioFile}`);
    }

    // Get file stats for logging
    const fileStats = await fs.stat(audioFile);
    const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(2);
    
    // Check file size limit (25MB for OpenAI)
    const openAIConstraints = TRANSCRIPTION_CONFIG.openai.constraints || {};
    const openAIMaxFileSize = openAIConstraints.maxFileSize || Infinity;
    if (fileStats.size > openAIMaxFileSize) {
        throw new Error(`Audio file too large: ${fileSizeMB} MB. Maximum size: ${(openAIMaxFileSize / 1024 / 1024).toFixed(2)} MB`);
    }

    console.log(`[OpenAI] Starting transcription for recording ${recordingId || 'unknown'} (${fileSizeMB} MB)`);

    try {
        // Use fsSync.createReadStream() - fs is the promises version which doesn't have createReadStream
        const fileStream = fsSync.createReadStream(audioFile);
        
        const transcript = await openAIClient.audio.transcriptions.create({
            file: fileStream,
            model: modelName,
            response_format: "diarized_json",
            chunking_strategy: "auto",
        });

        console.log(`[OpenAI] Transcription completed for recording ${recordingId || 'unknown'}`);
        return transcript;
    } catch (error) {
        console.error(`[OpenAI] Transcription error for recording ${recordingId || 'unknown'}:`, {
            message: error.message,
            status: error.status,
            code: error.code,
            response: error.response?.data
        });

        // Handle model not found error - fallback to whisper-1
        if (error.message && error.message.includes("model not found")) {
            console.log(`[OpenAI] Model ${modelName} not found, falling back to whisper-1`);
            modelName = "whisper-1";
            
            try {
                const fileStream = fsSync.createReadStream(audioFile);
                const transcript = await openAIClient.audio.transcriptions.create({
                    file: fileStream,
                    model: modelName,
                    response_format: "json",
                });
                console.log(`[OpenAI] Fallback transcription completed with whisper-1`);
                return transcript;
            } catch (fallbackError) {
                console.error(`[OpenAI] Fallback transcription also failed:`, fallbackError.message);
                throw new Error(`OpenAI transcription failed with both models. Last error: ${fallbackError.message}`);
            }
        } else {
            // Enhanced error messages
            if (error.response) {
                throw new Error(`OpenAI API error (${error.response.status}): ${error.response.data?.error?.message || error.message}`);
            } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                throw new Error(`OpenAI network error: ${error.message}. Check your internet connection.`);
            } else {
                throw new Error(`OpenAI transcription failed: ${error.message}`);
            }
        }
    }
};
  
  const openAIFormat = async (transcriptData) => {
  
      if (!transcriptData) {
          throw new Error("Failed to get transcription data from OpenAI");
      }
      
      let speakerSentences = '';
      let currentSpeaker = ''
      let timeStamps = [];
      let speakerLabels = [];
      transcriptData.segments.forEach(segment => {
        const { speaker, text, start, end } = segment;
        timeStamps.push({ text, start, end });
        if (speaker) {
          speakerLabels.push({ speaker, startTime: start, endTime: end, text });
        }
        if (currentSpeaker != speaker) {
          if (speaker) {
              currentSpeaker = speaker
          }
          speakerSentences += `\n ${currentSpeaker}: ${text}`
        } else {
          speakerSentences += ` ${text}`
        }
      });
  
      return {
          transcriptionText: speakerSentences,
          transcriptionStatus: 'completed',
          duration: transcriptData.duration,
          transcriptionMetadata: {
              provider: 'openai',
              model: 'whisper-1',
              // jobId: transcriptData.id,
              language: 'en',
              confidence: transcriptData.segments?.reduce((acc, s) => acc + (s.confidence || 0), 0) / 
                      (transcriptData.segments?.length || 1),
              // sentiment: analyzeSentiment(1),
              timestamps: timeStamps,
              speakerLabels: speakerLabels,
              processedAt: new Date(),
              // processingTime: (new Date(transcriptData.update_time) - new Date(transcriptData.create_time)) / 1000
          }
      }
  }
  
  const assemblyAITranscribeAudioService = async (audioFile, fileUrl, recordingId) => {
      const apiKey = TRANSCRIPTION_CONFIG.assemblyai.apiKey;
      const timeout = TRANSCRIPTION_CONFIG.assemblyai.timeout;
      if (!apiKey) {
        throw new Error('AssemblyAI API key is not configured');
      }

      // Step 1: Upload audio file if no URL provided
      if (!fileUrl) {
          console.log(`[AssemblyAI] Uploading audio file for recording ${recordingId}...`);
          
          // Use file stream for large files to avoid memory issues
          const fileStream = fsSync.createReadStream(audioFile);
          const fileStats = await fs.stat(audioFile);
          
          try {
              const uploadResponse = await axios.post(
                  `${ASSEMBLYAI_API_BASE}/upload`, 
                  fileStream,
                  {
                      headers: {
                          'authorization': apiKey,
                          // Don't set Content-Type - let axios detect it from the file
                          // For binary data, axios will set appropriate content-type
                      },
                      timeout: 300000, // 5 minutes for large file uploads
                      maxContentLength: Infinity,
                      maxBodyLength: Infinity,
                      // Add upload progress logging
                      onUploadProgress: (progressEvent) => {
                          if (progressEvent.total && fileStats.size) {
                              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                              if (percentCompleted % 25 === 0) { // Log every 25%
                                  console.log(`[AssemblyAI] Upload progress: ${percentCompleted}% (${(progressEvent.loaded / 1024 / 1024).toFixed(2)} MB / ${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`);
                              }
                          }
                      }
                  }
              );
              
              if (uploadResponse.status >= 400) {
                  const errorMsg = uploadResponse.data?.error || uploadResponse.statusText || 'Unknown error';
                  throw new Error(`AssemblyAI upload failed (${uploadResponse.status}): ${errorMsg}`);
              }
              
              fileUrl = uploadResponse.data.upload_url;
              if (!fileUrl) {
                  throw new Error('Failed to get upload_url from AssemblyAI upload response');
              }
              
              console.log(`[AssemblyAI] File uploaded successfully. Upload URL: ${fileUrl.substring(0, 50)}...`);
          } catch (error) {
              // Enhanced error handling for upload failures
              if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message.includes('socket hang up')) {
                  console.error(`[AssemblyAI] Network error during upload: ${error.message}`);
                  throw new Error(`AssemblyAI upload failed due to network error: ${error.message}. File size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB. Try again or use a smaller file.`);
              }
              throw error;
          }
      }

      try {
          console.log(`[AssemblyAI] Starting transcription for recording ${recordingId}`);
          console.log(`[AssemblyAI] Using audio URL: ${fileUrl.substring(0, 80)}...`);
          
          // Step 2: Create transcript with the upload URL
          const transcriptResponse = await axios.post(
              `${ASSEMBLYAI_API_BASE}/transcript`,
              {
                  audio_url: fileUrl,
                  speech_model: "universal",
                  speaker_labels: true,
                  language_detection: true,
                  language_detection_options: {
                      expected_languages: ["en", "hi", "kn", "ml", "ta", "te", "si"],
                      code_switching: true,
                      code_switching_confidence_threshold: 0.5,
                      fallback_language: "auto"
                  }
              },
              {
                  headers: {
                      'authorization': apiKey,
                      'content-type': 'application/json'
                  },
                  timeout: 60000 // 60 seconds for transcript creation
              }
          );

          // Check for HTTP errors
          if (transcriptResponse.status >= 400) {
              const errorMsg = transcriptResponse.data?.error || transcriptResponse.statusText || 'Unknown error';
              throw new Error(`AssemblyAI transcription failed (${transcriptResponse.status}): ${errorMsg}`);
          }

          const transcriptId = transcriptResponse.data?.id;
          if (!transcriptId) {
              console.error('[AssemblyAI] Transcript creation response:', JSON.stringify(transcriptResponse.data, null, 2));
              const error = new Error('Failed to get transcript ID from AssemblyAI. Response: ' + JSON.stringify(transcriptResponse.data));
              error.jobId = null;
              throw error;
          }

          console.log(`[AssemblyAI] Transcript ID: ${transcriptId}, polling for completion...`);

          // Step 3: Poll for transcript completion
          const startTime = Date.now();
          const pollInterval = 3000; // Poll every 3 seconds
          let transcript = null;
          let pollCount = 0;
          let lastStatusLogAt = 0;
          let previousStatus = null;

          while (Date.now() - startTime < timeout) {
              try {
                  const statusResponse = await axios.get(
                      `${ASSEMBLYAI_API_BASE}/transcript/${transcriptId}`,
                      {
                          headers: {
                              'authorization': apiKey
                          },
                          timeout: 30000,
                          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
                      }
                  );

                  // Check for HTTP errors
                  if (statusResponse.status >= 400) {
                      const errorMsg = statusResponse.data?.error || statusResponse.statusText || 'Unknown error';
                      throw new Error(`AssemblyAI status check failed (${statusResponse.status}): ${errorMsg}`);
                  }

                  transcript = statusResponse.data;
                  pollCount++;
                  
                  if (transcript.status === 'completed') {
                      console.log(`[AssemblyAI] Transcription completed for ${recordingId}`);
                      logTranscriptionDiagnostic('assemblyai:poll', {
                        transcriptId,
                        status: transcript.status,
                        recordingId,
                        pollCount,
                        elapsedMs: Date.now() - startTime
                      });
                      break;
                  } else if (transcript.status === 'error') {
                      // Check if error is due to empty audio (no spoken content)
                      const errorMessage = transcript.error || '';
                      if (errorMessage.includes("no spoken audio") || 
                          errorMessage.includes("language_detection cannot be performed")) {
                          console.log(`[AssemblyAI] Empty audio detected for recording ${recordingId}, returning empty transcript`);
                          const duration = await getAudioDuration(audioFile);
                          return {
                              id: transcriptId,
                              status: "completed",
                              utterances: [],
                              duration: duration || 0,
                              confidence: null
                          };
                      }
                      const error = new Error(`AssemblyAI transcription error: ${transcript.error}`);
                      error.jobId = transcriptId;
                      throw error;
                  } else if (transcript.status === 'queued' || transcript.status === 'processing') {
                      const now = Date.now();
                      if (previousStatus !== transcript.status || now - lastStatusLogAt > 15000) {
                      console.log(`[AssemblyAI] Status: ${transcript.status}, waiting...`);
                          logTranscriptionDiagnostic('assemblyai:poll', {
                            transcriptId,
                            status: transcript.status,
                            recordingId,
                            pollCount,
                            elapsedMs: now - startTime
                          });
                          previousStatus = transcript.status;
                          lastStatusLogAt = now;
                      }
                      await new Promise(resolve => setTimeout(resolve, pollInterval));
                  } else {
                      const error = new Error(`Unknown transcript status: ${transcript.status}`);
                      error.jobId = transcriptId;
                      throw error;
                  }
              } catch (error) {
                  // If it's a network error during polling, log and retry
                  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message.includes('fetch failed')) {
                      console.warn(`[AssemblyAI] Network error during polling: ${error.message}, retrying...`);
                      await new Promise(resolve => setTimeout(resolve, pollInterval));
                      continue;
                  }
                  // Preserve job ID in error
                  if (!error.jobId && transcriptId) {
                      error.jobId = transcriptId;
                  }
                  throw error;
              }
          }

          if (!transcript || transcript.status !== 'completed') {
              const error = new Error(`AssemblyAI transcription timed out after ${timeout}ms. Last status: ${transcript?.status || 'unknown'}`);
              error.jobId = transcriptId;
              throw error;
          }

          // Return transcript data
          return transcript;
      } catch (error) {
          // Enhanced error logging for debugging
          console.error(`[AssemblyAI] Transcription error for recording ${recordingId}:`, {
              message: error.message,
              code: error.code,
              response: error.response?.data,
              status: error.response?.status,
              stack: error.stack
          });
          logTranscriptionDiagnostic('assemblyai:error', {
            recordingId,
            message: error.message,
            code: error.code,
            status: error.response?.status,
            jobId: error.jobId
          });

          // Handle API errors that might indicate empty audio
          const errorMessage = error.message || error.toString() || '';
          const errorResponse = error.response?.data?.error || '';
          
          if (errorMessage.includes("no spoken audio") || 
              errorMessage.includes("language_detection cannot be performed") ||
              errorResponse.includes("no spoken audio") ||
              errorResponse.includes("language_detection cannot be performed")) {
              console.log(`[AssemblyAI] Empty audio detected for recording ${recordingId}, returning empty transcript`);
              const duration = await getAudioDuration(audioFile);
              return {
                  id: null,
                  status: "completed",
                  utterances: [],
                  duration: duration || 0,
                  confidence: null
              };
          }

          // Re-throw with more context, preserving job ID if available
          const enhancedError = new Error();
          if (error.response) {
              enhancedError.message = `AssemblyAI API error (${error.response.status}): ${error.response.data?.error || error.message}`;
          } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message.includes('fetch failed')) {
              enhancedError.message = `AssemblyAI network error: ${error.message}. Check your internet connection and API endpoint.`;
          } else {
              enhancedError.message = `AssemblyAI transcription failed: ${error.message}`;
          }
          // Preserve job ID from original error if available
          enhancedError.jobId = error.jobId || null;
          throw enhancedError;
      }
  }
  
  const assemblyAIFormat = async (transcriptData) => {
  
      if (!transcriptData) {
          throw new Error("Failed to get transcription data from AssemblyAI");
      }
      let speakerSentences = '';
      let currentSpeaker = ''
      let timeStamps = [];
      let speakerLabels = [];
      // Ensure utterances is an array (handles empty audio case)
      const utterances = transcriptData.utterances || [];
      for (const utterance of utterances) {
          const { speaker, text, start, end, confidence } = utterance;
          timeStamps.push({ text, start, end });
          if (speaker) {
              speakerLabels.push({ speaker, startTime: start, endTime: end, text });
          }
          if (currentSpeaker != speaker) {
              if (speaker) {
                  currentSpeaker = speaker
              }
              speakerSentences += `\n ${currentSpeaker}: ${text}`
          } else {
              speakerSentences += ` ${text}`
          }
      }
      return {
          transcriptionText: speakerSentences,
          transcriptionStatus: 'completed',
          duration: transcriptData.duration,
          transcriptionMetadata: {
              provider: 'assemblyai',
              model: 'universal',
              jobId: transcriptData.id,
              language: 'en',
              confidence: transcriptData.confidence,
              timestamps: timeStamps,
              speakerLabels: speakerLabels,
              processedAt: new Date(),
              // processingTime: (new Date(transcriptData.update_time) - new Date(transcriptData.create_time)) / 1000
          }
      }
  }

/**
 * Salad transcription service - creates async job and returns job ID
 */
const saladTranscribeAudioService = async (fileUrl, recordingId) => {
  const apiKey = TRANSCRIPTION_CONFIG.salad.apiKey;
  const timeout = TRANSCRIPTION_CONFIG.salad.timeout;
  
  if (!apiKey) {
    throw new Error('Salad API key is not configured');
  }

  if (!fileUrl) {
    throw new Error('File URL is required for Salad transcription');
  }

  try {
    console.log(`[Salad] Starting transcription job for recording ${recordingId}`);
    console.log(`[Salad] Using audio URL: ${fileUrl.substring(0, 80)}...`);
    
    // Create transcription job
    const jobResponse = await axios.post(
      SALAD_API_URL,
      {
        audio_url: fileUrl,
        webhook_url: WEBHOOK_URL
      },
      {
        headers: {
          'Salad-Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 seconds for job creation
      }
    );

    if (jobResponse.status >= 400) {
      const errorMsg = jobResponse.data?.error || jobResponse.statusText || 'Unknown error';
      throw new Error(`Salad job creation failed (${jobResponse.status}): ${errorMsg}`);
    }

    const jobId = jobResponse.data?.id || jobResponse.data?.job_id;
    if (!jobId) {
      console.error('[Salad] Job creation response:', JSON.stringify(jobResponse.data, null, 2));
      throw new Error('Failed to get job ID from Salad. Response: ' + JSON.stringify(jobResponse.data));
    }

    console.log(`[Salad] Job created with ID: ${jobId}`);
    
    // Return job data - the actual transcription will be handled by the webhook or polling
    return {
      id: jobId,
      status: 'processing',
      jobId: jobId
    };
  } catch (error) {
    console.error(`[Salad] Transcription error for recording ${recordingId}:`, {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status
    });

    if (error.response) {
      throw new Error(`Salad API error (${error.response.status}): ${error.response.data?.error || error.message}`);
    } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      throw new Error(`Salad network error: ${error.message}. Check your internet connection.`);
    } else {
      throw new Error(`Salad transcription failed: ${error.message}`);
    }
  }
};

/**
 * Format Salad transcription response
 */
const saladFormat = async (transcriptData) => {
  if (!transcriptData) {
    throw new Error("Failed to get transcription data from Salad");
  }

  // Salad returns data in a specific format - adjust based on actual API response
  const status = transcriptData.status || transcriptData.state || 'processing';
  const transcriptionText = transcriptData.transcript || transcriptData.text || '';
  const utterances = transcriptData.utterances || transcriptData.segments || [];
  
  let speakerSentences = '';
  let currentSpeaker = '';
  let timeStamps = [];
  let speakerLabels = [];

  if (utterances && utterances.length > 0) {
    for (const utterance of utterances) {
      const { speaker, text, start, end, startTime, endTime } = utterance;
      const startTimeNum = start || startTime || 0;
      const endTimeNum = end || endTime || 0;
      
      timeStamps.push({ text: text || '', start: startTimeNum, end: endTimeNum });
      
      if (speaker) {
        speakerLabels.push({ 
          speaker, 
          startTime: startTimeNum, 
          endTime: endTimeNum, 
          text: text || '' 
        });
      }
      
      if (currentSpeaker !== speaker) {
        if (speaker) {
          currentSpeaker = speaker;
        }
        speakerSentences += `\n ${currentSpeaker || 'SPEAKER'}: ${text || ''}`;
      } else {
        speakerSentences += ` ${text || ''}`;
      }
    }
  } else if (transcriptionText) {
    // If we only have text without segments
    speakerSentences = transcriptionText;
  }

  return {
    transcriptionText: speakerSentences.trim(),
    transcriptionStatus: status === 'completed' || status === 'done' ? 'completed' : 'processing',
    duration: transcriptData.duration || 0,
    transcriptionMetadata: {
      provider: 'salad',
      model: transcriptData.model || 'default',
      jobId: transcriptData.id || transcriptData.job_id,
      language: transcriptData.language || 'en',
      confidence: transcriptData.confidence || null,
      timestamps: timeStamps,
      speakerLabels: speakerLabels,
      processedAt: new Date()
    }
  };
};

// Keep existing service functions (openai, assemblyai, salad) unchanged
// Just update the format dispatcher:

const formatTranscriptResponseFromTool = async (transcriptData, format) => {
  switch (format) {
    case 'salad':
      return await saladFormat(transcriptData);
    case 'openai':
      return await openAIFormat(transcriptData);
    case 'assemblyai':
      return await assemblyAIFormat(transcriptData);
    case 'google':
      return await googleFormat(transcriptData);
    default:
      throw new Error('Unsupported transcription tool for formatting');
  }
};

/**
 * Log transcription attempt for monitoring
 */
async function logTranscriptionAttempt(data) {
  // Implement logging to database or monitoring service
  console.log('[Transcription Attempt]', JSON.stringify(data));
  // TODO: Store in a TranscriptionLog collection for analytics
}

/**
 * Fetch status for async transcription jobs (Salad)
 */
const fetchTranscriptionStatus = async (jobId) => {
  try {
    const response = await axios.get(`${SALAD_API_URL}/${jobId}`, {
      headers: { 'Salad-Api-Key': TRANSCRIPTION_CONFIG.salad.apiKey }
    });
    
    return await formatTranscriptResponseFromTool(response.data, 'salad');
  } catch (error) {
    console.error('Salad API Error:', error.response?.data || error.message);
    throw new Error('Error fetching transcription status');
  }
};

// Keep all existing format functions (saladFormat, openAIFormat, assemblyAIFormat, etc.)
// ... [Include your existing formatting functions here]

module.exports = {
  requestTranscription,
  fetchTranscriptionStatus,
  TRANSCRIPTION_CONFIG,
  CHUNK_CONFIG,
  transcriptionState
};