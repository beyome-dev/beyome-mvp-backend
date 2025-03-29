const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// const AssessmentSchema = new mongoose.Schema({
//     title: { type: String, required: true },
//     description: { type: String, required: true }
//   });
  
//   const PlanItemSchema = new mongoose.Schema({
//     title: { type: String, required: true },
//     steps: [{ type: String, required: true }]
//   });

const NoteSchema = new Schema({
    patientName: { 
        type: String, 
        required: true 
    },
    title: {
        type: String,
        required: true
    },
    visitType: { 
        type: String, 
        required: true 
    }, // e.g., Psychiatry Follow-Up
    visitDate: { 
        type: Date, 
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
        enum: ['Recording', 'Dictation', 'Citation Note'],
    },// eg. Recording, Dictation, Citation Note
    outputContent: {
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
    patientInstructions: {
        type: String
    },
    doctorFeedback: {
        type: String
    },
    patientFeedback: {
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
    doctor: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    patient: {
        type: Schema.Types.ObjectId,
        ref: 'User'
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
    analysisResults: {
        type: Map,
        of: Schema.Types.Mixed
    }
}, { timestamps: true });

module.exports = mongoose.model('Note', NoteSchema);

NoteSchema.index({ doctor: 1, patient: 1, status: 1, visitDate: -1 });