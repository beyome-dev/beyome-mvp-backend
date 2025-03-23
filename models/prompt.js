const mongoose = require('mongoose');
const note = require('./note');
const Schema = mongoose.Schema;


const PromptSchema = new Schema({
    formatName: {
        type: String,
        unique: true,
        require: true
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
    }
}, { timestamps: true });

module.exports = mongoose.model('Prompt', PromptSchema);