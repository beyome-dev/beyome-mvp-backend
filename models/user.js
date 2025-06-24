const mongoose = require('mongoose');
const { validate } = require('./note');
const Schema = mongoose.Schema;

const CalendarSettings = new mongoose.Schema({
    reminderMinutes: { type: Number, required: true },
    syncAppointments: {
        type: Boolean,
        default: false,
    },
    syncEnabled: {
        type: Boolean,
        default: false,
    }
})

const UserSchema = new Schema({
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        // required: [true, 'Please enter an email'],
        unique: true,
        lowercase: true,
    },
    phone: {
        type: String,
        unique: true,
        validate: {
            validator: (v) => {
                return /^(\+?\d+)$/.test(v);
            },
            message: (props) => `${props.value} is not a valid phone number`
        }
    },
    password: {
        type: String,
    },
    office_location: {
        type: String,
    },
    specialty: {
        type: String,
        enum: [
            'Clinical Psychologist',
            'Counseling Psychologist',
            'Child Psychologist',
            'School Psychologist',
            'Neuropsychologist',
            'Health Psychologist',
            'Forensic Psychologist',
            'Rehabilitation Psychologist',
            'Industrial-Organizational Psychologist',
            'Addiction Counselor',
            'Marriage and Family Therapist',
            'Psychiatrist',
            'Child and Adolescent Psychiatrist',
            'Geriatric Psychiatrist',
            'Forensic Psychiatrist',
            'Consultation-Liaison Psychiatrist',
            'Emergency Psychiatrist',
            'Military Psychiatrist',
            'Community Psychiatrist'
        ],
        required: false
    },
    handlers: [{
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: false
    }],
    organization: {
        type: String,
    },
    picture: {
        type: String,
    },
    userType: {
        type: String,
        enum: [
            'psychiatrist',       // Doctors with full access to app features
            'therapist',          // Psychologists with slightly fewer permissions
            'receptionist',       // Handles bookings, scheduling, and client inbounds
            'org_admin',          // Organization admin with extended privileges
            'platform_admin',      // Internal/admin-only access for platform control
            'client',             // Clients with limited access to their own data
            'manager'
          ],
          default: 'therapist'
    },
    isAdmin: {
        type: Boolean,
        default: false,
    },
    emailVerfied: {
        type: Boolean,
        default: false,
    },
    hasActivePlan: {
        type: Boolean,
        default: false,
    },
    currentPlan: {
        type: String,
    },
    twoFactorAuth: {
        type: Boolean,
        default: false,
    },
    hasResetPassword: {
        type: Boolean,
        default: false,
    },
    patientSummary: {
        type: String,
    },
    googleTokens: {
        access_token: String,
        refresh_token: String,
        scope: String,
        token_type: String,
        expiry_date: Number,
    },
    tags:   {
        type: [String],
        default: []
    },
    calendarSettings: {
        type: CalendarSettings,
         default: null,
    },
}, { timestamps: true });

// UserSchema.statics.isEmailTaken = async function (email, excludeUserId) {
//     const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
//     return !!user;
// };

const User = mongoose.model('User', UserSchema);

module.exports = User;