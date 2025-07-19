const mongoose = require('mongoose');
const { validate } = require('./note');
const Schema = mongoose.Schema;

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
    anonymous: {
        type: Boolean,
        default: false,
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
    pronouns: {
        type: String,
        enum: ['He/Him', 'She/Her', 'They/Them', 'He/They', 'She/They', 'Other'],
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other', 'prefer_not_to_say'],
    },
    address: {
        houseName: String,
        street: String,
        city: String,
        distrinct: String,
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
        type: String,
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
    consentSigned: {
        type: Boolean,
        default: false
    },
    consentDate: {
        type: Date
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

const Client = mongoose.model('Client', ClientSchema);

module.exports = Client;