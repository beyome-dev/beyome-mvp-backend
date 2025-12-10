const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const encryptionService = require('../services/encryption/encryption.service');
const config = require('../config');


  
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
    
    // Preserve original AI-generated content before user edits
    originalGeneratedContent: {
        // Store a snapshot of the original generated content
        content: {
            subjective: String,
            objective: String,
            assessment: String,
            plan: String,
            data: String,
            analysis: String,
            customSections: [{
                label: String,
                content: String,
                order: Number
            }]
        },
        formattedContent: String,
        rawContent: String
    },
  
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

// Pre-save hook: Encrypt PHI fields before saving
NoteSchema.pre('save', async function (next) {
  if (!config.encryption.enabled || (this.isNew === false && !this.isModified())) {
    return next();
  }

  try {
    // Encrypt formattedContent
    if (this.formattedContent && typeof this.formattedContent === 'string' && this.formattedContent !== '') {
      this.formattedContent = await encryptionService.encrypt(this.formattedContent, {
        resourceType: 'Note',
        resourceId: this._id,
        field: 'formattedContent',
      });
    }

    // Encrypt rawContent
    if (this.rawContent && typeof this.rawContent === 'string' && this.rawContent !== '') {
      this.rawContent = await encryptionService.encrypt(this.rawContent, {
        resourceType: 'Note',
        resourceId: this._id,
        field: 'rawContent',
      });
    }

    // Encrypt content object (all structured fields)
    if (this.content && typeof this.content === 'object') {
      this.content = await encryptionService.encryptNestedObject(this.content);
    }

    // Encrypt originalGeneratedContent
    if (this.originalGeneratedContent && typeof this.originalGeneratedContent === 'object') {
      this.originalGeneratedContent = await encryptionService.encryptNestedObject(this.originalGeneratedContent);
    }

    // Encrypt aiMetadata.completePrompt (may contain PHI)
    if (this.aiMetadata && this.aiMetadata.completePrompt && typeof this.aiMetadata.completePrompt === 'string' && this.aiMetadata.completePrompt !== '') {
      this.aiMetadata.completePrompt = await encryptionService.encrypt(this.aiMetadata.completePrompt, {
        resourceType: 'Note',
        resourceId: this._id,
        field: 'aiMetadata.completePrompt',
      });
    }

    next();
  } catch (error) {
    console.error('[Note Model] Encryption error:', error.message);
    next(error);
  }
});

// Post-find hook: Decrypt PHI fields after retrieval
NoteSchema.post(['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete'], async function (docs) {
  if (!config.encryption.enabled || !docs) {
    return;
  }

  const documents = Array.isArray(docs) ? docs : [docs];

  for (const doc of documents) {
    if (!doc) continue;

    try {
      // Decrypt formattedContent
      if (doc.formattedContent && typeof doc.formattedContent === 'string' && doc.formattedContent !== '') {
        doc.formattedContent = await encryptionService.decrypt(doc.formattedContent, {
          resourceType: 'Note',
          resourceId: doc._id,
          field: 'formattedContent',
        });
      }

      // Decrypt rawContent
      if (doc.rawContent && typeof doc.rawContent === 'string' && doc.rawContent !== '') {
        doc.rawContent = await encryptionService.decrypt(doc.rawContent, {
          resourceType: 'Note',
          resourceId: doc._id,
          field: 'rawContent',
        });
      }

      // Decrypt content object
      if (doc.content && typeof doc.content === 'object') {
        doc.content = await encryptionService.decryptNestedObject(doc.content);
      }

      // Decrypt originalGeneratedContent
      if (doc.originalGeneratedContent && typeof doc.originalGeneratedContent === 'object') {
        doc.originalGeneratedContent = await encryptionService.decryptNestedObject(doc.originalGeneratedContent);
      }

      // Decrypt aiMetadata.completePrompt
      if (doc.aiMetadata && doc.aiMetadata.completePrompt && typeof doc.aiMetadata.completePrompt === 'string' && doc.aiMetadata.completePrompt !== '') {
        doc.aiMetadata.completePrompt = await encryptionService.decrypt(doc.aiMetadata.completePrompt, {
          resourceType: 'Note',
          resourceId: doc._id,
          field: 'aiMetadata.completePrompt',
        });
      }
    } catch (error) {
      console.error('[Note Model] Decryption error:', error.message);
      // Continue with other documents even if one fails
    }
  }
});

// Post-findOne hook for single document
NoteSchema.post('findOne', async function (doc) {
  if (!config.encryption.enabled || !doc) {
    return;
  }

  try {
    // Decrypt formattedContent
    if (doc.formattedContent && typeof doc.formattedContent === 'string' && doc.formattedContent !== '') {
      doc.formattedContent = await encryptionService.decrypt(doc.formattedContent, {
        resourceType: 'Note',
        resourceId: doc._id,
        field: 'formattedContent',
      });
    }

    // Decrypt rawContent
    if (doc.rawContent && typeof doc.rawContent === 'string' && doc.rawContent !== '') {
      doc.rawContent = await encryptionService.decrypt(doc.rawContent, {
        resourceType: 'Note',
        resourceId: doc._id,
        field: 'rawContent',
      });
    }

    // Decrypt content object
    if (doc.content && typeof doc.content === 'object') {
      doc.content = await encryptionService.decryptNestedObject(doc.content);
    }

    // Decrypt originalGeneratedContent
    if (doc.originalGeneratedContent && typeof doc.originalGeneratedContent === 'object') {
      doc.originalGeneratedContent = await encryptionService.decryptNestedObject(doc.originalGeneratedContent);
    }

    // Decrypt aiMetadata.completePrompt
    if (doc.aiMetadata && doc.aiMetadata.completePrompt && typeof doc.aiMetadata.completePrompt === 'string' && doc.aiMetadata.completePrompt !== '') {
      doc.aiMetadata.completePrompt = await encryptionService.decrypt(doc.aiMetadata.completePrompt, {
        resourceType: 'Note',
        resourceId: doc._id,
        field: 'aiMetadata.completePrompt',
      });
    }
  } catch (error) {
    console.error('[Note Model] Decryption error:', error.message);
  }
});

NoteSchema.index({ user: 1, client: 1, status: 1});

module.exports = mongoose.model('Note', NoteSchema);