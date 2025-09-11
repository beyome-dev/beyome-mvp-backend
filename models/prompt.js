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