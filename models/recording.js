const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const recordingTools = ['openai', 'assemblyai', 'google', 'salad', 'sarvam'];

// Sub-schema for transcription attempts tracking
const transcriptionAttemptSchema = new Schema({
  attemptNumber: { type: Number, required: true },
  tool: {
    type: String,
    enum: recordingTools,
    required: true
  },
  status: {
    type: String,
    enum: ['attempting', 'success', 'failed'],
    required: true
  },
  jobId: String, // Job/transcript ID from the transcription service (AssemblyAI transcript ID, Salad job ID, etc.)
  error: {
    message: String,
    code: String,
    stack: String
  },
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
  duration: Number, // milliseconds
  batchProcessed: { type: Boolean, default: false },
  chunkCount: Number
}, { _id: false });

// Sub-schema for chunk processing (when batch processing is used)
const chunkProcessingSchema = new Schema({
  totalChunks: Number,
  processedChunks: Number,
  failedChunks: [Number],
  chunkDuration: Number, // seconds per chunk
  overlap: Number, // seconds
  chunks: [{
    index: Number,
    startTime: Number,
    endTime: Number,
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed']
    },
    transcribedAt: Date
  }]
}, { _id: false });

// Main Recording Schema
const recordingSchema = new Schema({
  sessionId: {
    type: Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
    index: true
  },
  therapistId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  recordingType: {
    type: String,
    enum: ['session_recording', 'dictation'],
    required: true
  },
  
  // Audio file info
  filename: String,
  filePath: String,
  audioUrl: String,
  audioKey: String,
  duration: Number, // seconds
  fileSize: Number, // bytes
  format: {
    type: String,
    enum: ['mp3', 'wav', 'webm', 'm4a', 'ogg', 'mpeg', 'mp4', 'x-m4a', 'wave', 'text']
  },
  languageCode: {
    type: String,
    default: 'auto'
  },
  // Enhanced Transcription tracking
  transcriptionStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'retrying'],
    default: 'pending',
    index: true
  },
  transcriptionText: String,
  
  // Track all transcription attempts
  transcriptionAttempts: [transcriptionAttemptSchema],
  
  // Current/successful transcription metadata
  transcriptionMetadata: {
    provider: {
      type: String,
      enum: recordingTools
    },
    jobId: String,
    model: String,
    language: String,
    confidence: Number,
    
    // Sentiment analysis
    sentiment: {
      score: Number, // -1 to 1
      label: {
        type: String,
        enum: ['positive', 'neutral', 'negative']
      }
    },
    
    // Speaker diarization
    speakerLabels: [{
      speaker: String,
      startTime: Number,
      endTime: Number,
      text: String,
      confidence: Number
    }],
    
    // Word-level timestamps
    timestamps: [{
      text: String,
      start: Number,
      end: Number,
      confidence: Number
    }],
    
    // Processing metadata
    processedAt: Date,
    processingTime: Number, // milliseconds
    attemptNumber: Number, // Which attempt succeeded
    toolsAttempted: [String], // List of tools tried before success
    batchProcessed: { type: Boolean, default: false },
    
    // Batch processing details (if applicable)
    batchInfo: chunkProcessingSchema
  },
  
  // Error tracking
  transcriptionError: {
    message: String,
    code: String,
    timestamp: Date,
    attemptNumber: Number,
    tool: String,
    isRecoverable: { type: Boolean, default: true }
  },
  
  // Retry configuration
  retryConfig: {
    maxRetries: { type: Number, default: 3 },
    currentRetry: { type: Number, default: 0 },
    nextRetryAt: Date,
    backoffMultiplier: { type: Number, default: 2 },
    preferredTool: {
      type: String,
      enum: recordingTools
    },
    fallbackEnabled: { type: Boolean, default: true }
  },
  
  // AI-generated summary
  summary: String,
  summaryMetadata: {
    model: String,
    generatedAt: Date,
    keyPoints: [String],
    actionItems: [String],
    sentiment: {
      score: Number,
      label: {
        type: String,
        enum: ['positive', 'neutral', 'negative']
      }
    }
  },
  
  // Quality metrics
  qualityMetrics: {
    audioQuality: {
      type: String,
      enum: ['poor', 'fair', 'good', 'excellent']
    },
    backgroundNoise: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    transcriptionAccuracy: Number, // 0-1
    speakerClarityScore: Number // 0-1
  },
  
  recordedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
recordingSchema.index({ sessionId: 1, recordedAt: 1 });
recordingSchema.index({ therapistId: 1, recordedAt: -1 });
recordingSchema.index({ transcriptionStatus: 1, createdAt: 1 });
recordingSchema.index({ 'retryConfig.nextRetryAt': 1, transcriptionStatus: 1 });

// Compound index for retry queue processing
recordingSchema.index({ 
  transcriptionStatus: 1, 
  'retryConfig.nextRetryAt': 1,
  'retryConfig.currentRetry': 1 
});

// Text index for searching
recordingSchema.index({ 
  transcriptionText: 'text', 
  summary: 'text' 
});

// Instance methods
recordingSchema.methods.addTranscriptionAttempt = function(attemptData) {
  this.transcriptionAttempts.push({
    attemptNumber: this.transcriptionAttempts.length + 1,
    tool: attemptData.tool,
    status: attemptData.status,
    jobId: attemptData.jobId || null, // Store job ID if provided
    error: attemptData.error,
    startedAt: new Date(),
    completedAt: attemptData.status !== 'attempting' ? new Date() : null,
    batchProcessed: attemptData.batchProcessed || false,
    chunkCount: attemptData.chunkCount
  });
  
  this.retryConfig.currentRetry = this.transcriptionAttempts.length;
};

recordingSchema.methods.shouldRetry = function() {
  return (
    this.transcriptionStatus === 'failed' &&
    this.retryConfig.fallbackEnabled &&
    this.retryConfig.currentRetry < this.retryConfig.maxRetries &&
    (!this.retryConfig.nextRetryAt || this.retryConfig.nextRetryAt <= new Date())
  );
};

recordingSchema.methods.calculateNextRetry = function() {
  const baseDelay = 60000; // 1 minute
  const backoff = Math.pow(
    this.retryConfig.backoffMultiplier,
    this.retryConfig.currentRetry
  );
  const delayMs = Math.min(baseDelay * backoff, 3600000); // Max 1 hour
  
  this.retryConfig.nextRetryAt = new Date(Date.now() + delayMs);
  return this.retryConfig.nextRetryAt;
};

recordingSchema.methods.markTranscriptionSuccess = function(result) {
  this.transcriptionStatus = 'completed';
  this.transcriptionText = result.transcriptionText;
  this.transcriptionMetadata = result.transcriptionMetadata;
  this.transcriptionError = null;
  
  // Update the last attempt to success
  if (this.transcriptionAttempts.length > 0) {
    const lastAttempt = this.transcriptionAttempts[this.transcriptionAttempts.length - 1];
    lastAttempt.status = 'success';
    lastAttempt.completedAt = new Date();
    lastAttempt.duration = Date.now() - lastAttempt.startedAt.getTime();
  }
};

recordingSchema.methods.markTranscriptionFailed = function(error, tool) {
  // Check if we should retry BEFORE updating status
  const canRetry = this.shouldRetry();
  
  this.transcriptionStatus = canRetry ? 'retrying' : 'failed';
  this.transcriptionError = {
    message: error.message,
    code: error.code || 'TRANSCRIPTION_ERROR',
    timestamp: new Date(),
    attemptNumber: this.transcriptionAttempts.length,
    tool: tool,
    isRecoverable: error.isRecoverable !== false
  };
  
  // Update the last attempt to failed
  if (this.transcriptionAttempts.length > 0) {
    const lastAttempt = this.transcriptionAttempts[this.transcriptionAttempts.length - 1];
    lastAttempt.status = 'failed';
    lastAttempt.completedAt = new Date();
    lastAttempt.duration = Date.now() - lastAttempt.startedAt.getTime();
    lastAttempt.error = {
      message: error.message,
      code: error.code,
      stack: error.stack
    };
  }
  
  // Only calculate next retry if we can actually retry
  if (canRetry) {
    this.calculateNextRetry();
  } else {
    // Clear nextRetryAt to prevent it from being picked up again
    this.retryConfig.nextRetryAt = null;
  }
};

// Static methods for batch operations
recordingSchema.statics.findReadyForRetry = function() {
  return this.find({
    transcriptionStatus: { $in: ['failed', 'retrying'] },
    'retryConfig.nextRetryAt': { $lte: new Date() },
    'retryConfig.fallbackEnabled': true,
    // Ensure we only pick documents where currentRetry < maxRetries (strict check)
    $expr: { 
      $and: [
        { $lt: ['$retryConfig.currentRetry', '$retryConfig.maxRetries'] },
        { $ne: ['$retryConfig.nextRetryAt', null] }
      ]
    }
  }).sort({ 'retryConfig.nextRetryAt': 1 });
};

// Find recordings that were processing when server crashed (for resume)
recordingSchema.statics.findIncompleteTranscriptions = function() {
  return this.find({
    transcriptionStatus: 'processing',
    // Has batch info indicating partial completion
    $or: [
      {
        'transcriptionMetadata.batchInfo': { $exists: true },
        'transcriptionMetadata.batchInfo.processedChunks': { $exists: true, $gt: 0 },
        $expr: {
          $lt: [
            '$transcriptionMetadata.batchInfo.processedChunks',
            '$transcriptionMetadata.batchInfo.totalChunks'
          ]
        }
      },
      // Or just processing status without batch info (might be single chunk or just started)
      {
        'transcriptionMetadata.batchInfo': { $exists: false },
        updatedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } // Stuck for more than 5 minutes
      }
    ]
  }).sort({ updatedAt: 1 });
};

recordingSchema.statics.getTranscriptionStats = async function(therapistId, dateRange) {
  return this.aggregate([
    {
      $match: {
        therapistId: therapistId,
        createdAt: { $gte: dateRange.start, $lte: dateRange.end }
      }
    },
    {
      $group: {
        _id: '$transcriptionStatus',
        count: { $sum: 1 },
        avgAttempts: { $avg: { $size: '$transcriptionAttempts' } },
        avgProcessingTime: { $avg: '$transcriptionMetadata.processingTime' }
      }
    }
  ]);
};

// Virtual for success rate
recordingSchema.virtual('successRate').get(function() {
  const successAttempts = this.transcriptionAttempts.filter(a => a.status === 'success').length;
  const totalAttempts = this.transcriptionAttempts.length;
  return totalAttempts > 0 ? (successAttempts / totalAttempts) * 100 : 0;
});

// Pre-save middleware
recordingSchema.pre('save', function(next) {
  // Ensure retry config defaults
  if (!this.retryConfig.maxRetries) {
    this.retryConfig.maxRetries = 3;
  }
  if (this.retryConfig.currentRetry === undefined) {
    this.retryConfig.currentRetry = 0;
  }
  next();
});

module.exports = mongoose.model('Recording', recordingSchema);