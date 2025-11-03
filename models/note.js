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
    noteType: {
        type: String,
        // enum: ['SOAP', 'DAP', 'BIRP', 'progress', 'intake', 'discharge', 'custom'],
        default: 'SOAP'
    },
    tags: {
        type: [String],
        required: true
    },
    sessionId: {
        type: Schema.Types.ObjectId,
        ref: 'Session',
        required: true,
        index: true
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

    
     // Structured content based on template
    content: {
        // SOAP format example
        subjective: String,
        objective: String,
        assessment: String,
        plan: String,
    
        // DAP format example
        data: String,
        analysis: String,
        // plan: String, (reused from above)
    
        // Custom fields
        customSections: [{
            label: String,
            content: String,
            order: Number
        }]
    },
    formattedContent: {
        type: String,
        required: true
    },

    // Full text for search
    rawContent: String,
  
    status: {
        type: String,
        enum: ['pending','draft', 'finalized', 'signed', 'amended'],
        default: 'draft',
        index: true
    },
    version: {
        type: Number,
        default: 1
    },

    // Track which recordings were used
    generatedFromRecordings: [{
        recordingId: { type: Schema.Types.ObjectId, ref: 'Recording' },
        recordingType: String,
        usedAt: Date
    }],

     // AI metadata
  aiGenerated: { type: Boolean, default: false },
  aiMetadata: {
    model: String,
    promptId: Schema.Types.ObjectId,
    completePrompt: String,
    generatedAt: Date,
    editedByUser: { type: Boolean, default: false },
    confidence: Number,
    tokensUsed: Number
  },

  // Signature and compliance
  signedAt: Date,
  signedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  signature: String,

}, { timestamps: true });

module.exports = mongoose.model('Note', NoteSchema);

NoteSchema.index({ user: 1, client: 1, status: 1});