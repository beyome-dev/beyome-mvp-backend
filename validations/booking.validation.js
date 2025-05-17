const { Joi, Segments, CelebrateError } = require('celebrate');

// Booking validation schemas
const bookingCreateSchema = {
    [Segments.BODY]: Joi.object().keys({
        visitType: Joi.string().valid(
            'Follow-Up', 'Orientation', 'Consultation', 'Assessment', 'Therapy',
            'Medication Management', 'Crisis Intervention', 'Group Therapy',
            'Family Therapy', 'Teletherapy', 'In-Person Therapy'
        ).required(),
        handler: Joi.string().optional(),
        client: Joi.string().required(),
        date: Joi.string().regex(/^\d{4}-\d{2}-\d{2}$/).required(),
        time: Joi.string().regex(/^\d{2}:\d{2}$/).required(),
        checkInTime: Joi.string().regex(/^\d{2}:\d{2}$/).optional(),
        checkOutTime: Joi.string().regex(/^\d{2}:\d{2}$/).optional(),
        status: Joi.string().valid("booked", "completed", "cancelled", "no-show", "in-progress", "rescheduled").optional(),
        personalNotes: Joi.array().items(Joi.string()).optional(),
        userFeedback: Joi.string().optional(),
        clientFeedback: Joi.array().items(Joi.object({
            question: Joi.string().required(),
            answer: Joi.string().required()
        })).optional(),
    }),
};

const bookingUpdateSchema = {
    [Segments.BODY]: Joi.object().keys({
        visitType: Joi.string().valid(
            'Follow-Up', 'Orientation', 'Consultation', 'Assessment', 'Therapy',
            'Medication Management', 'Crisis Intervention', 'Group Therapy',
            'Family Therapy', 'Teletherapy', 'In-Person Therapy'
        ),
        handler: Joi.string(),
        client: Joi.string(),
        date: Joi.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: Joi.string().regex(/^\d{2}:\d{2}$/),
        checkInTime: Joi.string().regex(/^\d{2}:\d{2}$/),
        checkOutTime: Joi.string().regex(/^\d{2}:\d{2}$/),
        status: Joi.string().valid("booked", "completed", "cancelled", "no-show", "in-progress", "rescheduled"),
        personalNotes: Joi.array().items(Joi.string()),
        userFeedback: Joi.string(),
        clientFeedback: Joi.array().items(Joi.object({
            question: Joi.string().required(),
            answer: Joi.string().required()
        }))
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