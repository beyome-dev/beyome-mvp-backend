const userService = require('./user.service');
const tokenService = require('./token.service');
const mailerService = require('./mailer.service');
const noteService = require('./note.service');
const googleCalendarService = require('./utilityServices/google/googleCalendar.service');

module.exports = {
    userService,
    tokenService,
    mailerService,
    noteService,
    googleCalendarService
}