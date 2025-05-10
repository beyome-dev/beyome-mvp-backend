const mongoose = require('mongoose');
const { validate } = require('./note');
const Schema = mongoose.Schema;

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
        required: [true, 'Please enter an email'],
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
            'manager'
          ],
          default: 'psychiatrist'
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
}, { timestamps: true });

UserSchema.statics.isEmailTaken = async function (email, excludeUserId) {
    const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
    return !!user;
};

const User = mongoose.model('user', UserSchema);

module.exports = User;