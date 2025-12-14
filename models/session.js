// models/booking.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const encryptionService = require('../services/encryption/encryption.service');
const config = require('../config');

// models/Session.js
const sessionSchema = new Schema({
    therapistId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    clientId: {
        type: Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
        index: true
    },
    sessionDate: {
        type: Date,
        required: true,
        index: true
    },
    sessionType: {
        type: String,
        enum: ['individual', 'group', 'family', 'couples', 'online'],
        default: 'individual'
    },
    cost: Number,
    duration: Number, // minutes
    status: {
        type: String,
        enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'transcribing'],
        default: 'in_progress',
        index: true
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
    },
    location: String,
    title: String,
    // Embedded recording metadata (summary info only)
    recordings: [{
        recordingId: { type: Schema.Types.ObjectId, ref: 'Recording' },
        recordingType: {
        type: String,
        enum: ['session_recording', 'dictation']
        },
        duration: Number,
        recordedAt: Date,
        // hasSummary: { type: Boolean, default: false }
    }],
  
    // Session-specific data
    metadata: {
        summary: {
            type: String, 
        },
        longSummary: {
            type: String, 
        },
        mood: {
            start: Number, // 1-10 scale
            end: Number
        },
        sessionGoals: [String],
        homework: [String],
        nextSessionGoals: [String],
        clientFeedback: String,
        customFields: Schema.Types.Mixed
    },
  
    // Quick stats
    stats: {
        recordingCount: { type: Number, default: 0 },
        totalDuration: { type: Number, default: 0 }, // seconds
        noteCount: { type: Number, default: 0 }
    },
    tags: [String],
}, {
  timestamps: true
});

// Compound indexes for common queries
sessionSchema.index({ therapistId: 1, sessionDate: -1 });
sessionSchema.index({ clientId: 1, sessionDate: -1 });
sessionSchema.index({ therapistId: 1, status: 1, sessionDate: -1 });
sessionSchema.index({ therapistId: 1, clientId: 1, sessionDate: -1 });

// Pre-save hook: Encrypt PHI fields before saving
sessionSchema.pre('save', async function (next) {
  if (!config.encryption.enabled || (this.isNew === false && !this.isModified('metadata'))) {
    return next();
  }

  try {
    // Encrypt metadata fields containing PHI
    if (this.metadata && typeof this.metadata === 'object') {
      // Encrypt summary
      if (this.metadata.summary && typeof this.metadata.summary === 'string' && this.metadata.summary !== '') {
        this.metadata.summary = await encryptionService.encrypt(this.metadata.summary, {
          resourceType: 'Session',
          resourceId: this._id,
          field: 'metadata.summary',
        });
      }

      // Encrypt longSummary
      if (this.metadata.longSummary && typeof this.metadata.longSummary === 'string' && this.metadata.longSummary !== '') {
        this.metadata.longSummary = await encryptionService.encrypt(this.metadata.longSummary, {
          resourceType: 'Session',
          resourceId: this._id,
          field: 'metadata.longSummary',
        });
      }

      // Encrypt clientFeedback
      if (this.metadata.clientFeedback && typeof this.metadata.clientFeedback === 'string' && this.metadata.clientFeedback !== '') {
        this.metadata.clientFeedback = await encryptionService.encrypt(this.metadata.clientFeedback, {
          resourceType: 'Session',
          resourceId: this._id,
          field: 'metadata.clientFeedback',
        });
      }

      // Encrypt customFields (may contain PHI)
      if (this.metadata.customFields && typeof this.metadata.customFields === 'object') {
        this.metadata.customFields = await encryptionService.encryptNestedObject(this.metadata.customFields);
      }

      // Encrypt sessionGoals, homework, nextSessionGoals arrays (may contain PHI)
      if (Array.isArray(this.metadata.sessionGoals)) {
        this.metadata.sessionGoals = await Promise.all(
          this.metadata.sessionGoals.map(async (goal) => {
            if (typeof goal === 'string' && goal !== '') {
              return await encryptionService.encrypt(goal, {
                resourceType: 'Session',
                resourceId: this._id,
                field: 'metadata.sessionGoals',
              });
            }
            return goal;
          })
        );
      }

      if (Array.isArray(this.metadata.homework)) {
        this.metadata.homework = await Promise.all(
          this.metadata.homework.map(async (item) => {
            if (typeof item === 'string' && item !== '') {
              return await encryptionService.encrypt(item, {
                resourceType: 'Session',
                resourceId: this._id,
                field: 'metadata.homework',
              });
            }
            return item;
          })
        );
      }

      if (Array.isArray(this.metadata.nextSessionGoals)) {
        this.metadata.nextSessionGoals = await Promise.all(
          this.metadata.nextSessionGoals.map(async (goal) => {
            if (typeof goal === 'string' && goal !== '') {
              return await encryptionService.encrypt(goal, {
                resourceType: 'Session',
                resourceId: this._id,
                field: 'metadata.nextSessionGoals',
              });
            }
            return goal;
          })
        );
      }
    }

    next();
  } catch (error) {
    console.error('[Session Model] Encryption error:', error.message);
    next(error);
  }
});

// Post-find hook: Decrypt PHI fields after retrieval
sessionSchema.post(['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete'], async function (docs) {
  if (!config.encryption.enabled || !docs) {
    return;
  }

  const documents = Array.isArray(docs) ? docs : [docs];

  for (const doc of documents) {
    if (!doc) continue;

    try {
      // Decrypt metadata fields
      if (doc.metadata && typeof doc.metadata === 'object') {
        // Decrypt summary
        if (doc.metadata.summary && typeof doc.metadata.summary === 'string' && doc.metadata.summary !== '') {
          doc.metadata.summary = await encryptionService.decrypt(doc.metadata.summary, {
            resourceType: 'Session',
            resourceId: doc._id,
            field: 'metadata.summary',
          });
        }

        // Decrypt longSummary
        if (doc.metadata.longSummary && typeof doc.metadata.longSummary === 'string' && doc.metadata.longSummary !== '') {
          doc.metadata.longSummary = await encryptionService.decrypt(doc.metadata.longSummary, {
            resourceType: 'Session',
            resourceId: doc._id,
            field: 'metadata.longSummary',
          });
        }

        // Decrypt clientFeedback
        if (doc.metadata.clientFeedback && typeof doc.metadata.clientFeedback === 'string' && doc.metadata.clientFeedback !== '') {
          doc.metadata.clientFeedback = await encryptionService.decrypt(doc.metadata.clientFeedback, {
            resourceType: 'Session',
            resourceId: doc._id,
            field: 'metadata.clientFeedback',
          });
        }

        // Decrypt customFields
        if (doc.metadata.customFields && typeof doc.metadata.customFields === 'object') {
          doc.metadata.customFields = await encryptionService.decryptNestedObject(doc.metadata.customFields);
        }

        // Decrypt arrays
        if (Array.isArray(doc.metadata.sessionGoals)) {
          doc.metadata.sessionGoals = await Promise.all(
            doc.metadata.sessionGoals.map(async (goal) => {
              if (typeof goal === 'string' && goal !== '') {
                return await encryptionService.decrypt(goal, {
                  resourceType: 'Session',
                  resourceId: doc._id,
                  field: 'metadata.sessionGoals',
                });
              }
              return goal;
            })
          );
        }

        if (Array.isArray(doc.metadata.homework)) {
          doc.metadata.homework = await Promise.all(
            doc.metadata.homework.map(async (item) => {
              if (typeof item === 'string' && item !== '') {
                return await encryptionService.decrypt(item, {
                  resourceType: 'Session',
                  resourceId: doc._id,
                  field: 'metadata.homework',
                });
              }
              return item;
            })
          );
        }

        if (Array.isArray(doc.metadata.nextSessionGoals)) {
          doc.metadata.nextSessionGoals = await Promise.all(
            doc.metadata.nextSessionGoals.map(async (goal) => {
              if (typeof goal === 'string' && goal !== '') {
                return await encryptionService.decrypt(goal, {
                  resourceType: 'Session',
                  resourceId: doc._id,
                  field: 'metadata.nextSessionGoals',
                });
              }
              return goal;
            })
          );
        }
      }
    } catch (error) {
      console.error('[Session Model] Decryption error:', error.message);
      // Continue with other documents even if one fails
    }
  }
});

// Post-findOne hook for single document
sessionSchema.post('findOne', async function (doc) {
  if (!config.encryption.enabled || !doc) {
    return;
  }

  try {
    // Decrypt metadata fields
    if (doc.metadata && typeof doc.metadata === 'object') {
      if (doc.metadata.summary && typeof doc.metadata.summary === 'string' && doc.metadata.summary !== '') {
        doc.metadata.summary = await encryptionService.decrypt(doc.metadata.summary, {
          resourceType: 'Session',
          resourceId: doc._id,
          field: 'metadata.summary',
        });
      }

      if (doc.metadata.longSummary && typeof doc.metadata.longSummary === 'string' && doc.metadata.longSummary !== '') {
        doc.metadata.longSummary = await encryptionService.decrypt(doc.metadata.longSummary, {
          resourceType: 'Session',
          resourceId: doc._id,
          field: 'metadata.longSummary',
        });
      }

      if (doc.metadata.clientFeedback && typeof doc.metadata.clientFeedback === 'string' && doc.metadata.clientFeedback !== '') {
        doc.metadata.clientFeedback = await encryptionService.decrypt(doc.metadata.clientFeedback, {
          resourceType: 'Session',
          resourceId: doc._id,
          field: 'metadata.clientFeedback',
        });
      }

      if (doc.metadata.customFields && typeof doc.metadata.customFields === 'object') {
        doc.metadata.customFields = await encryptionService.decryptNestedObject(doc.metadata.customFields);
      }

      if (Array.isArray(doc.metadata.sessionGoals)) {
        doc.metadata.sessionGoals = await Promise.all(
          doc.metadata.sessionGoals.map(async (goal) => {
            if (typeof goal === 'string' && goal !== '') {
              return await encryptionService.decrypt(goal, {
                resourceType: 'Session',
                resourceId: doc._id,
                field: 'metadata.sessionGoals',
              });
            }
            return goal;
          })
        );
      }

      if (Array.isArray(doc.metadata.homework)) {
        doc.metadata.homework = await Promise.all(
          doc.metadata.homework.map(async (item) => {
            if (typeof item === 'string' && item !== '') {
              return await encryptionService.decrypt(item, {
                resourceType: 'Session',
                resourceId: doc._id,
                field: 'metadata.homework',
              });
            }
            return item;
          })
        );
      }

      if (Array.isArray(doc.metadata.nextSessionGoals)) {
        doc.metadata.nextSessionGoals = await Promise.all(
          doc.metadata.nextSessionGoals.map(async (goal) => {
            if (typeof goal === 'string' && goal !== '') {
              return await encryptionService.decrypt(goal, {
                resourceType: 'Session',
                resourceId: doc._id,
                field: 'metadata.nextSessionGoals',
              });
            }
            return goal;
          })
        );
      }
    }
  } catch (error) {
    console.error('[Session Model] Decryption error:', error.message);
  }
});

module.exports = mongoose.model('Session', sessionSchema);