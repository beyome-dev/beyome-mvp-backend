const mongoose = require('mongoose');
const { validate } = require('./note');
const Schema = mongoose.Schema;
const encryptionService = require('../services/encryption/encryption.service');
const config = require('../config');

const ClientSchema = new Schema({
    firstName: {
        type: String
    },
    lastName: {
        type: String
    },
    nickName: {
        type: String
    },
        clientNumber: {
        type: String,
        required: true
    },
    email: {
        type: String,
        lowercase: true,
    },
    phone: {
        type: String,
        validate: {
            validator: (v) => {
                return /^(\+?\d+)$/.test(v);
            },
            message: (props) => `${props.value} is not a valid phone number`
        }
    },
    dateOfBirth: {
        type: Date,
    },
    ageGroup: {
        type: String,
        enum: ['7-18', '19-25', '26-40', '41-65', '65+', 'N/A'],
        default: 'N/A'
    },
    pronouns: {
        type: String,
        //enum: ['He/Him', 'She/Her', 'They/Them', 'He/They', 'She/They', 'Other'],
    },
    gender: {
        type: String,
        // enum: ['man', 'woman', 'non_binary', 'genderqueer', 'transgender', 'intersex', 'agender', 'other', 'prefer_not_to_say'],
    },
    address: {
        houseName: String,
        street: String,
        city: String,
        district: String,
        state: String,
        pincode: String,
        country: String
    },
    maritalStatus: {
        type: String,
        enum: ['single', 'married', 'divorced', 'widowed', 'separated', 'other'],
    },
    occupation: {
        type: String,
    },
    preferredLanguages: {
       type: [String],
        default: ["English"]
    },
    religion: {    
        type: String,
    },
    insuranceProvider: {
        type: String,
    },
    insuranceNumber: {
        type: String,
    },
    handler: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    organization: {
        type: Schema.Types.ObjectId,
        ref: 'Organization',
    },
    picture: {
        type: String,
    },
    clientType: {
        type: String,
        enum: [
            'individual',
            'family',
            'couple',
            'enterprise',
            'group', 
          ],
          default: 'individual'
    },
    emailVerfied: {
        type: Boolean,
        default: false,
    },
    summary: {
        type: String, // General summary about the client
    },
    diagnosis: {
        type: String, // Primary diagnosis or condition
    },
    treatmentPlan: {
        type: String, // Outline of treatment plan/goals
    },
    medications: [
        {
            name: String,
            dosage: String,
            frequency: String,
            startDate: Date,
            endDate: Date
        }
    ],
    emergencyContact: {
        name: String,
        relation: String,
        phone: String,
        email: String
    },
    riskAssessment: [
        {
            type: {
                type: String,
                enum: [
                    'suicidal_ideation',
                    'self_harm',
                    'violence',
                    'substance_abuse',
                    'medical',
                    'other'
                ],
                required: true
            },
            severity: {
                type: String,
                enum: ['low', 'moderate', 'high', 'critical'],
                required: true
            },
            notes: {
                type: String
            },
            dateIdentified: {
                type: Date,
                default: Date.now
            },
            actionsTaken: {
                type: String
            },
            resolved: {
                type: Boolean,
                default: false
            },
            dateResolved: {
                type: Date
            }
        }
    ],
    therapistConsentSigned: {
        type: Boolean,
        default: false
    },
    therapistConsentDate: {
        type: Date
    },
    therapistConsentUrl: {
        type: String
    },
    recappConsentSigned: {
        type: Boolean,
        default: false
    },
    recappConsentDate: {
        type: Date
    },
    recappConsentUrl: {
        type: String
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'unknown'],
        default: 'unknown',
        index: true
    },
    // Client-specific metadata
  metadata: {
    diagnosis: [String],
    medications: [String],
    allergies: [String],
    emergencyContact: {
      name: String,
      phone: String,
      relationship: String
    },
    insuranceInfo: {
      provider: String,
      policyNumber: String,
      groupNumber: String
    },
    referralSource: String,
    intakeDate: Date,
    customFields: Schema.Types.Mixed
  },

  // Session statistics (denormalized for quick access)
  stats: {
    totalSessions: { type: Number, default: 0 },
    lastSessionDate: Date,
    firstSessionDate: Date
  },

   tags:   {
        type: [String],
        default: []
    },
}, { timestamps: true });

ClientSchema.statics.isEmailTaken = async function (email, excludeClientId) {
    const client = await this.findOne({ handler, email, _id: { $ne: excludeClientId } });
    return !!client;
};

// PHI fields that need encryption
const PHI_FIELDS = [
  'firstName',
  'lastName',
  'nickName',
  'email',
  'phone',
  'dateOfBirth',
  'insuranceProvider',
  'insuranceNumber',
  'diagnosis',
  'summary',
  'treatmentPlan',
];

// Nested PHI fields
const NESTED_PHI_FIELDS = [
  'address',
  'emergencyContact',
  'metadata',
];

// Pre-save hook: Encrypt PHI fields before saving
ClientSchema.pre('save', async function (next) {
  if (!config.encryption.enabled || this.isNew === false && !this.isModified()) {
    return next();
  }

  try {
    // Encrypt simple PHI fields
    for (const field of PHI_FIELDS) {
      if (this[field] !== undefined && this[field] !== null && this[field] !== '') {
        if (field === 'dateOfBirth' && this[field] instanceof Date) {
          // Convert date to ISO string for encryption
          this[field] = await encryptionService.encrypt(this[field].toISOString(), {
            resourceType: 'Client',
            resourceId: this._id,
            field: field,
          });
        } else if (typeof this[field] === 'string') {
          this[field] = await encryptionService.encrypt(this[field], {
            resourceType: 'Client',
            resourceId: this._id,
            field: field,
          });
        }
      }
    }

    // Encrypt nested objects
    if (this.address && typeof this.address === 'object') {
      this.address = await encryptionService.encryptNestedObject(this.address);
    }

    if (this.emergencyContact && typeof this.emergencyContact === 'object') {
      this.emergencyContact = await encryptionService.encryptNestedObject(this.emergencyContact);
    }

    if (this.metadata && typeof this.metadata === 'object') {
      this.metadata = await encryptionService.encryptNestedObject(this.metadata);
    }

    // Encrypt medications array
    if (Array.isArray(this.medications) && this.medications.length > 0) {
      this.medications = await encryptionService.encryptNestedObject(this.medications);
    }

    // Encrypt riskAssessment array
    if (Array.isArray(this.riskAssessment) && this.riskAssessment.length > 0) {
      this.riskAssessment = await encryptionService.encryptNestedObject(this.riskAssessment);
    }

    next();
  } catch (error) {
    console.error('[Client Model] Encryption error:', error.message);
    next(error);
  }
});

// Post-find hook: Decrypt PHI fields after retrieval
ClientSchema.post(['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete'], async function (docs) {
  if (!config.encryption.enabled || !docs) {
    return;
  }

  const documents = Array.isArray(docs) ? docs : [docs];

  for (const doc of documents) {
    if (!doc) continue;

    try {
      // Decrypt simple PHI fields
      for (const field of PHI_FIELDS) {
        if (doc[field] !== undefined && doc[field] !== null && doc[field] !== '') {
          if (field === 'dateOfBirth') {
            const decrypted = await encryptionService.decrypt(doc[field], {
              resourceType: 'Client',
              resourceId: doc._id,
              field: field,
            });
            // Try to parse as date
            try {
              doc[field] = new Date(decrypted);
            } catch (e) {
              // Keep decrypted string if date parsing fails
              doc[field] = decrypted;
            }
          } else if (typeof doc[field] === 'string') {
            doc[field] = await encryptionService.decrypt(doc[field], {
              resourceType: 'Client',
              resourceId: doc._id,
              field: field,
            });
          }
        }
      }

      // Decrypt nested objects
      if (doc.address && typeof doc.address === 'object') {
        doc.address = await encryptionService.decryptNestedObject(doc.address);
      }

      if (doc.emergencyContact && typeof doc.emergencyContact === 'object') {
        doc.emergencyContact = await encryptionService.decryptNestedObject(doc.emergencyContact);
      }

      if (doc.metadata && typeof doc.metadata === 'object') {
        doc.metadata = await encryptionService.decryptNestedObject(doc.metadata);
      }

      // Decrypt medications array
      if (Array.isArray(doc.medications) && doc.medications.length > 0) {
        doc.medications = await encryptionService.decryptNestedObject(doc.medications);
      }

      // Decrypt riskAssessment array
      if (Array.isArray(doc.riskAssessment) && doc.riskAssessment.length > 0) {
        doc.riskAssessment = await encryptionService.decryptNestedObject(doc.riskAssessment);
      }
    } catch (error) {
      console.error('[Client Model] Decryption error:', error.message);
      // Continue with other documents even if one fails
    }
  }
});

// Post-findOne hook for single document
ClientSchema.post('findOne', async function (doc) {
  if (!config.encryption.enabled || !doc) {
    return;
  }

  try {
    // Decrypt simple PHI fields
    for (const field of PHI_FIELDS) {
      if (doc[field] !== undefined && doc[field] !== null && doc[field] !== '') {
        if (field === 'dateOfBirth') {
          const decrypted = await encryptionService.decrypt(doc[field], {
            resourceType: 'Client',
            resourceId: doc._id,
            field: field,
          });
          try {
            doc[field] = new Date(decrypted);
          } catch (e) {
            doc[field] = decrypted;
          }
        } else if (typeof doc[field] === 'string') {
          doc[field] = await encryptionService.decrypt(doc[field], {
            resourceType: 'Client',
            resourceId: doc._id,
            field: field,
          });
        }
      }
    }

    // Decrypt nested objects
    if (doc.address && typeof doc.address === 'object') {
      doc.address = await encryptionService.decryptNestedObject(doc.address);
    }

    if (doc.emergencyContact && typeof doc.emergencyContact === 'object') {
      doc.emergencyContact = await encryptionService.decryptNestedObject(doc.emergencyContact);
    }

    if (doc.metadata && typeof doc.metadata === 'object') {
      doc.metadata = await encryptionService.decryptNestedObject(doc.metadata);
    }

    // Decrypt medications array
    if (Array.isArray(doc.medications) && doc.medications.length > 0) {
      doc.medications = await encryptionService.decryptNestedObject(doc.medications);
    }

    // Decrypt riskAssessment array
    if (Array.isArray(doc.riskAssessment) && doc.riskAssessment.length > 0) {
      doc.riskAssessment = await encryptionService.decryptNestedObject(doc.riskAssessment);
    }
  } catch (error) {
    console.error('[Client Model] Decryption error:', error.message);
  }
});

const Client = mongoose.model('Client', ClientSchema);

module.exports = Client;