const mongoose = require('mongoose');
const Schema = mongoose.Schema;


  
//   const PlanItemSchema = new mongoose.Schema({
//     title: { type: String, required: true },
//     steps: [{ type: String, required: true }]
//   });

const NoteSchema = new Schema({
    title: {
        type: String,
        required: true
    },
    summary: {
        type: String, 
    },
    subjective: { 
        type: String, 
        required: true 
    },
    objective: { 
        type: String, 
        required: true 
    },
    assessment: { 
        type: String, 
        required: true 
    },
    plan: { 
        type: String, 
        required: true 
    },
    inputContent: {
        type: String,
        required: true
    },
    inputContentType: {
        type: String,
        required: true,
        enum: ['audio', 'text'],
    },
    noteType:{
        type: String,
        required: true,
        enum: ['Recording', 'Dictation', 'Citation Note'],
    },// eg. Recording, Dictation, Citation Note
    outputContent: {
        type: String,
        required: true
    },
    formattedOutputContent: {
        type: String,
        required: true
    },
    originialOutputContent: {
        type: String,
        required: false
    },
    sessionTranscript: {
        type: String
    },
    originalSessionTranscript: {
        type: String
    },
    clientInstructions: {
        type: String
    },
    userFeedback: {
        type: String
    },
    doctorFeedback: {
        type: String
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
    booking: {
        type: Schema.Types.ObjectId,
        ref: 'Booking',
    },
    client: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    organization: {
        type: Schema.Types.ObjectId,
        ref: 'Organization',
    },
    prompt: {
        type: Schema.Types.ObjectId,
        ref: 'Prompt',
        required: true
    },
    status: {
        type: String,
        required: true,
        default: 'pending',
        enum: ['pending', 'completed', 'failed', 'processing'],
    },// Eg. completed, failed, processing
    saladJobId: {
        type: String
    },
    failureReason: {
        type: String
    },
}, { timestamps: true });
