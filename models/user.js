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

// Sub-schema for degrees, licenses, and certifications
const CredentialSchema = new Schema({
    type: { type: String, required: true }, // e.g., "Degree", "License", "Certification"
    name: { type: String, required: true }, // e.g., "Ph.D. in Clinical Psychology"
    institution: { type: String, required: true }, // e.g., "Stanford University"
    year: { type: Number }, // e.g., 2020
    licenseNumber: { type: String }, // for licenses
    state: { type: String }, // for state-specific licenses
    isActive: { type: Boolean, default: true }
}, { _id: true });

// Sub-schema for therapeutic approaches
const TherapeuticApproachSchema = new Schema({
    name: { type: String, required: true }, // e.g., "CBT", "DBT", "EMDR"
    description: { type: String }, // brief description of the approach
    isPrimary: { type: Boolean, default: false } // whether this is a primary approach
}, { _id: true });

// Sub-schema for specializations
const SpecializationSchema = new Schema({
    area: { type: String, required: true }, // e.g., "Anxiety", "Depression", "Trauma"
    description: { type: String }, // brief description of expertise in this area
    yearsOfExperience: { type: Number } // years of experience in this specific area
}, { _id: true });


// Sub-schema for session types
const LinkTree = new Schema({
    type: { type: String, required: true }, 
    title: { type: String }, 
    url: { type: String },
    isActive: { type: Boolean, default: true }
}, { _id: true });

// Sub-schema for office locations
const OfficeLocationSchema = new Schema({
    name: { type: String, required: true }, // e.g., "Main Office", "Downtown Location",
    street: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    district: { type: String },
    state: { type: String, required: true },
    pincode: { type: String },
    country: { type: String },
    description: { type: String }, // setting description
    isPrimary: { type: Boolean, default: false }
}, { _id: true });

// Sub-schema for FAQ items
const FAQSchema = new Schema({
    question: { type: String, required: true },
    answer: { type: String, required: true },
    isActive: { type: Boolean, default: true }
}, { _id: true });

// Sub-schema for personal interests
const PersonalInterestSchema = new Schema({
    category: { type: String, required: true }, // e.g., "Hobbies", "Books", "Music", "TV Shows"
    items: [{ type: String }] // array of items in this category
}, { _id: true });


// Sub-schema for specializations
const ItinerarySchema = new Schema({
    name: { type: String, required: true }, // name of the itinerary
    description: { type: String }, // brief description of the itinerary
    price: { type: Number, required: true, default: 0 } // price of the itinerary
}, { _id: true });

const UserSchema = new Schema({
    // Personal Information
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    username: {
        type: String,
        unique: true,
        required: true,
        lowercase: true,
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Please enter an email'],
        unique: true,
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
    age: {
        type: Number,
        default: 0
    },
    password: {
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
            'Community Psychiatrist',
            'Social Worker',
            'Other'
        ],
        required: false
    },
    
    organization: {
        type: String,
    },
    profileImageUrl: {
        type: String,
    },
    tags:   {
        type: [String],
        default: []
    },
    
    // Profile Information
    title: {
        type: String,
        required: false
    },
    therapeuticBio: {
        type: String,
        required: false
    },
    credentials: {
        type: [CredentialSchema],
        default: []
    },
    price: {
        type: Number,
        required: false
    },
    yearsOfExperience: {
        type: Number,
        required: false,
        default: 0
    },
    languages: {
        type: [String],
        default: ["English"]
    },
    areaOfExpertise: {
        type: [String],
        default: []
    },
    personalStory: {
        type: String,
        required: false
    },
    therapeuticApproaches: {
        type: [TherapeuticApproachSchema],
        default: []
    },
    therapeuticPhilosophy: {
        type: String,
        required: false
    },
    specializations: {
        type: [SpecializationSchema],
        default: []
    },
    ageGroupsServed: {
        type: [String],
        default: ["7-18","19-25","26-40","41-65","65+"]
    },
    officeLocations: {
        type: [OfficeLocationSchema],
        default: []
    },
    sessionTypes: {
        type: [String],
        default: []
    },
    linkTree: {
        type: [LinkTree],
        default: []
    },
    schedulingAvailability: {
        type: Boolean,
        default: true,
    },
    responseTime: {
        type: String,
        required: false
    },
    personalInterests: {
        type: [PersonalInterestSchema],
        default: []
    },
    faq: {
        type: [FAQSchema],
        default: []
    },
    culturalBackground: {
        type: String,
        required: false
    },
    linkedin: {
        type: String,
        required: false
    },
    instagram: {
        type: String,
    },
    twitter: {
        type: String,
    },
    youtube: {
        type: String,
    },
    tiktok: {
        type: String,
    },
    facebook: {
        type: String,
    },
    website: {
        type: String,
    },
    otherSocials: {
        type: [String],
        default: []
    },
    itineraries: {
        type: [ItinerarySchema],
        default: []
    },
    calendarSettings: {
        type: CalendarSettings,
         default: null,
    },

    // System Information: Fields should not be editable by the user
    isDoctor: {
        type: Boolean,
        default: false,
    },
    userType: {
        type: String,
        enum: [
            'psychiatrist',       // Doctors with full access to app features
            'therapist',          // Psychologists with slightly fewer permissions
            'receptionist',       // Handles bookings, scheduling, and client inbounds
            'org_admin',          // Organization admin with extended privileges
            'platform_admin',     // Internal/admin-only access for platform control
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
        type: String,
        enum: [
            'early-access',     // For the beta phase
            'starter',          // For new users limit with 500 session
            'professional',     // For single user with unlimited acces
            'teams',            // For single clinic, included multiple users and managed by organization admin
            'enterprise',       // For multi clinic, included multiple users and clinics. Managed by organization admin
            'demo',             // For demo use
            'internal'          // For internal testing and other in house usage
        ],
        default: 'early-access'
    },
    planDueDate: {
        type: Date,
        default: null,
    },
    twoFactorAuth: {
        type: Boolean,
        default: false,
    },
    hasResetPassword: {
        type: Boolean,
        default: false,
    },
    googleTokens: {
        access_token: String,
        refresh_token: String,
        scope: String,
        token_type: String,
        expiry_date: Number,
    },
    enableDiscovery: {
        type: Boolean,
        default: true,
    },
    
}, { timestamps: true });

// Function to generate unique username
const generateUsername = async (firstName, lastName) => {
    const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/[^a-z0-9]/g, '');
    let username = baseUsername;
    let counter = 1;
    
    while (await User.findOne({ username })) {
        username = `${baseUsername}${counter}`;
        counter++;
    }
    
    return username;
};

// Pre-validate middleware to generate username before required validation runs
UserSchema.pre('validate', async function(next) {
    if (!this.username && this.firstName && this.lastName) {
        this.username = await generateUsername(this.firstName, this.lastName);
    }
    next();
});

UserSchema.statics.isEmailTaken = async function (email, excludeUserId) {
    const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
    return !!user;
};

UserSchema.statics.isUsernameTaken = async function (username, excludeUserId) {
    const user = await this.findOne({ username, _id: { $ne: excludeUserId } });
    return !!user;
};

const User = mongoose.model('User', UserSchema);

module.exports = User;