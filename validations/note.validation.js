const { Joi, Segments, CelebrateError } = require('celebrate');

const createSchema = {
    [Segments.BODY]: Joi.object().keys({
        firstName: Joi.string().required(),
        lastName: Joi.string().required(),
        email: Joi.string().email().required(),
        password: Joi.string().required().regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{6,30}$/).message(passwordMessage),
        picture: Joi.string(),
        phone: Joi.string(),
    }),
}