const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const PromptSchema = new Schema({
    formatName: {
        type: String,
        unique: true,
        required: true
    },
    shortDescription: {
        type: String,
        required: true
    },
    longDescription: {
        type: String,
        required: true
    },
    promptText: {
        type: [String]
    },
    systemInstructions: {
        type: String,
        required: true
    },
    categories: {
        type: [String],
        required: true
    },
    roles: {
        type: [String],
        required: true,
        default: 'all-users',
        enum: [
            'psychiatrist',       // Doctors with full access to app features
            'therapist',          // Psychologists with slightly fewer permissions
            'receptionist',       // Handles bookings, scheduling, and client inbounds
            'org_admin',          // Organization admin with extended privileges
            'platform_admin',     // Internal/admin-only access for platform control
            'manager',
            "all-users"
        ]
    },
    specialtyTypes: {
        type: [String],
        required: true
    },
    aiEngine: {
        type: String,
        required: true
    },
    approved: {
        type: Boolean,
        default: false,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    organization: {
        type: Schema.Types.ObjectId,
        ref: 'Organization',
    }
}, { timestamps: true });

module.exports = mongoose.model('Prompt', PromptSchema);