const { Joi, Segments, CelebrateError } = require('celebrate');

const passwordMessage = 'password must contain at least one uppercase letter, one lowercase letter, and one numeric digit';

const specialtyEnum = [
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
];

// Sub-schemas for profile fields
const credentialSchema = Joi.object().keys({
    type: Joi.string().required(),
    name: Joi.string().required(),
    institution: Joi.string().required(),
    year: Joi.number().integer().min(1900).max(new Date().getFullYear()).optional(),
    licenseNumber: Joi.string().optional(),
    state: Joi.string().optional(),
    isActive: Joi.boolean().default(true)
});

const therapeuticApproachSchema = Joi.object().keys({
    name: Joi.string().required(),
    description: Joi.string().optional(),
    isPrimary: Joi.boolean().default(false)
});

const specializationSchema = Joi.object().keys({
    area: Joi.string().required(),
    description: Joi.string().optional(),
    yearsOfExperience: Joi.number().integer().min(0).optional()
});

const linkTreeSchema = Joi.object().keys({
    type: Joi.string().required(),
    title: Joi.string().optional(),
    url: Joi.string().optional(),
    isActive: Joi.boolean().default(true)
});

const officeLocationSchema = Joi.object().keys({
    name: Joi.string().required(),
    street: Joi.string().required(),
    address: Joi.string().required(),
    city: Joi.string().required(),
    district: Joi.string().optional(),
    state: Joi.string().required(),
    pincode: Joi.string().optional(),
    country: Joi.string().optional(),
    description: Joi.string().optional(),
    isPrimary: Joi.boolean().default(false)
});

const faqSchema = Joi.object().keys({
    question: Joi.string().required(),
    answer: Joi.string().required(),
    isActive: Joi.boolean().default(true)
});

const personalInterestSchema = Joi.object().keys({
    category: Joi.string().required(),
    items: Joi.array().items(Joi.string()).optional()
});

const loginSchema = {
    [Segments.BODY]: Joi.object().keys({
        email: Joi.string().email().required(),
        password: Joi.string(),
    }),
}

//To check a password between 8 to 15 characters 
// which contain at least one lowercase letter, one uppercase letter, one numeric digit, and one special
// /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{6,15}$/
// (?=.*[!@#$&*])
const registerSchema = {
    [Segments.BODY]: Joi.object().keys({
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        // username: Joi.string().alphanum().min(3).max(30).optional(),
        email: Joi.string().email().required(),
        password: Joi.string().required().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{6,30}$/).message(passwordMessage),
        age: Joi.number().integer().min(18).max(120).required(),
        picture: Joi.string().optional(),
        specialty: Joi.string().valid(...specialtyEnum).optional(),
        organization: Joi.string().optional(),
        phone: Joi.string().optional(),
        // New profile fields
        title: Joi.string().optional(),
        therapeuticBio: Joi.string().optional(),
        price: Joi.number().positive().optional(),
        yearsOfExperience: Joi.number().integer().min(0).default(0).optional(),
        personalStory: Joi.string().optional(),
        culturalBackground: Joi.string().optional(),
        credentials: Joi.array().items(credentialSchema).optional(),
        languages: Joi.array().items(Joi.string()).default(["English"]).optional(),
        areaOfExpertise: Joi.array().items(Joi.string()).optional(),
        therapeuticApproaches: Joi.array().items(therapeuticApproachSchema).optional(),
        therapeuticPhilosophy: Joi.string().optional(),
        specializations: Joi.array().items(specializationSchema).optional(),
        ageGroupsServed: Joi.array().items(Joi.string()).default(["7-18","19-25","26-40","41-65","65+"]).optional(),
        officeLocations: Joi.array().items(officeLocationSchema).optional(),
        sessionTypes: Joi.array().items(Joi.string()).optional(),
        linkTree: Joi.array().items(linkTreeSchema).optional(),
        schedulingAvailability: Joi.boolean().default(true).optional(),
        responseTime: Joi.string().optional(),
        personalInterests: Joi.array().items(personalInterestSchema).optional(),
        faq: Joi.array().items(faqSchema).optional(),
        enableDiscovery: Joi.boolean().default(true),
        userType: Joi.string().valid('psychiatrist', 'therapist', 'receptionist', 'org_admin', 'platform_admin', 'manager').default('therapist'),
        isDoctor: Joi.boolean().default(false),
        office_location: Joi.string().optional(),
        tags: Joi.array().items(Joi.string()).optional(),
        // Social media fields
        linkedin: Joi.string().uri().optional(),
        instagram: Joi.string().optional(),
        twitter: Joi.string().optional(),
        youtube: Joi.string().optional(),
        tiktok: Joi.string().optional(),
        facebook: Joi.string().optional(),
        website: Joi.string().uri().optional(),
        otherSocials: Joi.array().items(Joi.string()).optional(),
    }),
}

const waitlistSchema = {
    [Segments.BODY]: Joi.object().keys({
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        email: Joi.string().email().required(),
        phone: Joi.string().required(),
        specialty: Joi.string().valid(...specialtyEnum).required(),
        organization: Joi.string().allow(''),
    }),
}

const updateSchema = {
    [Segments.BODY]: Joi.object().keys({
        firstName: Joi.string().optional(),
        lastName: Joi.string().optional(),
        // username: Joi.string().alphanum().min(3).max(30).optional(),
        email: Joi.string().email().optional(),
        age: Joi.number().integer().min(18).max(120).optional(),
        password: Joi.string().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{6,30}$/).optional(),
        picture: Joi.string().optional(),
        phone: Joi.string().optional(),
        office_location: Joi.string().optional(),
        specialty: Joi.string().valid(...specialtyEnum).optional(),
        organization: Joi.string().optional(),
        calendarSettings: Joi.object().keys({
            syncEnabled: Joi.boolean().optional(),
            syncAppointments: Joi.boolean().optional(),
            reminderMinutes: Joi.number().integer().min(0).max(1440).optional(),
        }).optional(),
        // New profile fields
        title: Joi.string().optional(),
        therapeuticBio: Joi.string().optional(),
        price: Joi.number().positive().optional(),
        yearsOfExperience: Joi.number().integer().min(0).optional(),
        personalStory: Joi.string().optional(),
        culturalBackground: Joi.string().optional(),
        credentials: Joi.array().items(credentialSchema).optional(),
        languages: Joi.array().items(Joi.string()).optional(),
        areaOfExpertise: Joi.array().items(Joi.string()).optional(),
        therapeuticApproaches: Joi.array().items(therapeuticApproachSchema).optional(),
        therapeuticPhilosophy: Joi.string().optional(),
        specializations: Joi.array().items(specializationSchema).optional(),
        ageGroupsServed: Joi.array().items(Joi.string()).optional(),
        officeLocations: Joi.array().items(officeLocationSchema).optional(),
        sessionTypes: Joi.array().items(Joi.string()).optional(),
        linkTree: Joi.array().items(linkTreeSchema).optional(),
        schedulingAvailability: Joi.boolean().optional(),
        responseTime: Joi.string().optional(),
        personalInterests: Joi.array().items(personalInterestSchema).optional(),
        faq: Joi.array().items(faqSchema).optional(),
        enableDiscovery: Joi.boolean().optional(),
        userType: Joi.string().valid('psychiatrist', 'therapist', 'receptionist', 'org_admin', 'platform_admin', 'manager').optional(),
        isDoctor: Joi.boolean().optional(),
        tags: Joi.array().items(Joi.string()).optional(),
        // Social media fields
        linkedin: Joi.string().uri().optional(),
        instagram: Joi.string().optional(),
        twitter: Joi.string().optional(),
        youtube: Joi.string().optional(),
        tiktok: Joi.string().optional(),
        facebook: Joi.string().optional(),
        website: Joi.string().uri().optional(),
        otherSocials: Joi.array().items(Joi.string()).optional(),
    }),
}

const sendRequestEmailSchema = {
    [Segments.BODY]: Joi.object().keys({
        email: Joi.string().email().required(),
    }),
}

const resetPasswordSchema = {
    [Segments.BODY]: Joi.object().keys({
        password: Joi.string().required().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{6,30}$/).message(passwordMessage),
    }),
}

const changePasswordSchema = {
    [Segments.BODY]: Joi.object().keys({
        oldPassword: Joi.string().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{6,30}$/).message(passwordMessage),
        newPassword: Joi.string().required().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{6,30}$/).message(passwordMessage),
    }),
}

const googleTokenSchema = {
    [Segments.BODY]: Joi.object().keys({
        code: Joi.string().required(),
    }),
};

const createClientSchema = {
    [Segments.BODY]: Joi.object().keys({
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        email: Joi.string().email().allow('').optional(),
        phone: Joi.string().pattern(/^(\+?\d+)$/).allow('').optional(),
        picture: Joi.string().uri().optional(),
        organization: Joi.string().optional()
    }),
};

module.exports = {
    loginSchema,
    registerSchema,
    updateSchema,
    sendRequestEmailSchema,
    resetPasswordSchema,
    waitlistSchema,
    googleTokenSchema,
    createClientSchema,
    changePasswordSchema
}