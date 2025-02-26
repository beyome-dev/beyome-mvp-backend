const mongoose = require('mongoose');
const note = require('./note');
const Schema = mongoose.Schema;


const PromptSchema = new Schema({
    promptText: {
        type: String,
        required: true
    },
    aiEngine: {
        type: String,
        required: true
    },
    notes: {
        type: Schema.Types.ObjectId,
        ref: 'Note'
    }
}, { timestamps: true });

module.exports = mongoose.model('Prompt', PromptSchema);