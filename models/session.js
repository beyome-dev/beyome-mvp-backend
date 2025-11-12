// models/booking.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// models/Session.js
const sessionSchema = new Schema({
    therapistId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    clientId: {
        type: Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
        index: true
    },
    sessionDate: {
        type: Date,
        required: true,
        index: true
    },
    sessionType: {
        type: String,
        enum: ['individual', 'group', 'family', 'couples', 'online'],
        default: 'individual'
    },
    cost: Number,
    duration: Number, // minutes
    status: {
        type: String,
        enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'transcribing'],
        default: 'in_progress',
        index: true
    },
    location: String,
    title: String,
    // Embedded recording metadata (summary info only)
    recordings: [{
        recordingId: { type: Schema.Types.ObjectId, ref: 'Recording' },
        recordingType: {
        type: String,
        enum: ['session_recording', 'dictation']
        },
        duration: Number,
        recordedAt: Date,
        // hasSummary: { type: Boolean, default: false }
    }],
  
    // Session-specific data
    metadata: {
        summary: {
            type: String, 
        },
        mood: {
            start: Number, // 1-10 scale
            end: Number
        },
        sessionGoals: [String],
        homework: [String],
        nextSessionGoals: [String],
        clientFeedback: String,
        customFields: Schema.Types.Mixed
    },
  
    // Quick stats
    stats: {
        recordingCount: { type: Number, default: 0 },
        totalDuration: { type: Number, default: 0 }, // seconds
        noteCount: { type: Number, default: 0 }
    },
    tags: [String],
}, {
  timestamps: true
});

// Compound indexes for common queries
sessionSchema.index({ therapistId: 1, sessionDate: -1 });
sessionSchema.index({ clientId: 1, sessionDate: -1 });
sessionSchema.index({ therapistId: 1, status: 1, sessionDate: -1 });
sessionSchema.index({ therapistId: 1, clientId: 1, sessionDate: -1 });

module.exports = mongoose.model('Session', sessionSchema);