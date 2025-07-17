const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const PromptSchema = new Schema({
    formatName: {
        type: String,
        unique: true,
        required: true
    },
    promptText: {
        type: [String]
    },
    systemInstructions: {
        type: String,
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
    }
}, { timestamps: true });

module.exports = mongoose.model('Prompt', PromptSchema);