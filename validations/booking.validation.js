const { Joi, Segments, CelebrateError } = require('celebrate');

// Booking validation schemas
const bookingCreateSchema = {
    [Segments.BODY]: Joi.object().keys({
        visitType: Joi.string().valid(
            'Follow-Up', 'Orientation', 'Consultation', 'Assessment', 'Therapy',
            'Medication Management', 'Crisis Intervention', 'Group Therapy',
            'Family Therapy', 'Teletherapy', 'In-Person Therapy'
        ).required(),
        appointmentType: Joi.string().valid('online', 'offline').required(),
        handler: Joi.string().optional(),
        client: Joi.string().required(),
        date: Joi.string().regex(/^\d{4}-\d{2}-\d{2}$/).required(),
        time: Joi.string().regex(/^\d{2}:\d{2}$/).required(),
        checkInTime: Joi.forbidden(),
        checkOutTime: Joi.forbidden(),
        status: Joi.forbidden(),
        // checkInTime: Joi.string().regex(/^\d{2}:\d{2}$/).optional(),
        // checkOutTime: Joi.string().regex(/^\d{2}:\d{2}$/).optional(),
        // status: Joi.string().valid("booked", "completed", "cancelled", "no-show", "in-progress", "rescheduled").optional(),
        personalNotes: Joi.array().items(Joi.string()).optional(),
        userFeedback: Joi.string().optional(),
        clientFeedback: Joi.array().items(Joi.object({
            question: Joi.string().required(),
            answer: Joi.string().required()
        })).optional(),
        sessionCost: Joi.number().optional(),
        sessionCostPaid: Joi.boolean().optional(),
    }),
};

const bookingUpdateSchema = {
    [Segments.BODY]: Joi.object().keys({
        visitType: Joi.string().valid(
            'Follow-Up', 'Orientation', 'Consultation', 'Assessment', 'Therapy',
            'Medication Management', 'Crisis Intervention', 'Group Therapy',
            'Family Therapy', 'Teletherapy', 'In-Person Therapy'
        ),
        client: Joi.forbidden().messages({
            'any.unknown': 'Cannot change client, delete and create a new booking'
        }),
        date: Joi.forbidden().messages({
            'any.unknown': 'Use reschedule endpoint to change date'
        }),
        time: Joi.forbidden().messages({
            'any.unknown': 'Use reschedule endpoint to change time'
        }),
        checkInTime: Joi.forbidden().messages({
            'any.unknown': 'checkIn should be done using check in endpoint'
        }),
        checkOutTime: Joi.forbidden().messages({
            'any.unknown': 'checkInTime should be done using check out endpoint'
        }),
        status: Joi.string().valid("cancelled", "no-show"),
        personalNotes: Joi.array().items(Joi.string()),
        userFeedback: Joi.string(),
        clientFeedback: Joi.array().items(Joi.object({
            question: Joi.string().required(),
            answer: Joi.string().required()
        })),
        sessionCost: Joi.number().optional(),
        sessionCostPaid: Joi.boolean().optional(),
    }),
};

const bookingRescheduleSchema = {
    [Segments.BODY]: Joi.object().keys({
        newDate: Joi.string().regex(/^\d{4}-\d{2}-\d{2}$/).required(),
        newTime: Joi.string().regex(/^\d{2}:\d{2}$/).required()
    }),
};


module.exports = {
    bookingCreateSchema,
    bookingUpdateSchema,
    bookingRescheduleSchema
}