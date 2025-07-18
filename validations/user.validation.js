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
    'Community Psychiatrist'
];

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
        email: Joi.string().email().required(),
        password: Joi.string().required().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{6,30}$/).message(passwordMessage),
        picture: Joi.string(),
        specialty: Joi.string(),
        organization: Joi.string(),
        phone: Joi.string(),
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
        email: Joi.string().email().optional(),
        password: Joi.string().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{6,30}$/).optional(),
        picture: Joi.string().optional(),
        phone: Joi.string().optional(),
        office_location: Joi.string().optional(),
        specialty: Joi.string().valid(...specialtyEnum).optional(),
        calendarSettings: Joi.object().keys({
            syncEnabled: Joi.boolean().optional(),
            syncAppointments: Joi.boolean().optional(),
            reminderMinutes: Joi.number().integer().min(0).max(1440).optional(),
        }).optional(),
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