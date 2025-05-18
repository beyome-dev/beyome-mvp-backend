const userValidation = require('./user.validation');
const bookingValidation = require('./booking.validation');
// celebration options
const opts = {
    abortEarly: false,
    errors: {
        wrap: { label: '' },
    },
};
module.exports = {
    userValidation,
    bookingValidation,
    opts,
}