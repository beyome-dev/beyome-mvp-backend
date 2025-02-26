const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AssessmentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true }
  });
  
  const PlanItemSchema = new mongoose.Schema({
    title: { type: String, required: true },
    steps: [{ type: String, required: true }]
  });

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
    subjective: { 
        type: String, 
        required: true 
    },
    objective: { 
        type: String, 
        required: true 
    },
    assessment: [AssessmentSchema], // Array for sections like Anxiety and Stress, Smoking Cessation, etc.
    plan: [PlanItemSchema], // Array for plans corresponding to each assessment
    inputContent: {
        type: String,
        required: true
    },
    inputContentType: {
        type: String,
        required: true
    },// eg. Recording, Dictation, Citation Note
    outputContent: {
        type: String,
        required: true
    },
    sessionTranscript: {
        type: String
    },
    patientInstructions: {
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
        default: 'Pending'
    },// Eg. Completed, Failed, Processing
    saladJobId: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('Note', NoteSchema);