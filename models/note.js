const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const NoteSchema = new Schema({
    title: {
        type: String,
        required: true
    },
    inputContent: {
        type: String,
        required: true
    },
    inputContentType: {
        type: String,
        required: true
    },
    outputContent: {
        type: String,
        required: true
    },
    noteFormat: {
        type: String,
        required: true,
        default: 'SOAP'
    },
    tags: {
        type: [String],
        required: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    prompt: {
        type: Schema.Types.ObjectId,
        ref: 'Prompt',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Note', NoteSchema);