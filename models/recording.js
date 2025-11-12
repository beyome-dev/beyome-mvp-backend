const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// models/Recording.js
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
    filePath: String, // Local path before upload
    audioUrl: String, // Cloud Storage URL
    audioKey: String, // Cloud key for deletion
    duration: Number, // seconds
    fileSize: Number, // bytes
    format: {
        type: String,
        enum: ['mp3', 'wav', 'webm', 'm4a', 'ogg', 'mpeg','mp4']
    },
  
  // Transcription
    transcriptionStatus: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending',
        index: true
    },
    transcriptionText: String, // Full text
    transcriptionMetadata: {
        provider: String, // 'whisper', 'google', 'aws', 'salad
        jobId: String,
        model: String,
        language: String,
        confidence: Number,
        sentiment: {
            score: Number, // -1 to 1
            label: String // 'positive', 'neutral', 'negative'
        },
        speakerLabels: [{
            speaker: String,
            startTime: Number,
            endTime: Number,
            text: String
        }],
        timestamps: [{
            text: String,
            start: Number,
            end: Number
        }],
        processedAt: Date,
        processingTime: Number // milliseconds
    },
    transcriptionError: {
        message: String,
        code: String,
        timestamp: Date
    },
  
  // AI-generated summary
    summary: String,
    summaryMetadata: {
        model: String,
        generatedAt: Date,
        keyPoints: [String],
        actionItems: [String],
        sentiment: {
            score: Number, // -1 to 1
            label: String // 'positive', 'neutral', 'negative'
        }
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

// Text index for searching transcriptions
recordingSchema.index({ transcriptionText: 'text', summary: 'text' });

module.exports = mongoose.model('Recording', recordingSchema);