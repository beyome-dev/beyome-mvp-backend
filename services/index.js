const userService = require('./user.service');
const clientService = require('./client.service');
const tokenService = require('./token.service');
const mailerService = require('./mailer.service');
const noteService = require('./note.service');
const dashboardService = require('./dashboard.service');
const googleCalendarService = require('./utilityServices/google/googleCalendar.service');
const promptService = require('./prompt.service');
const waitlistService = require('./waitlist.service');
const checklistService = require('./checklist.service');
const configService = require('./config.service');
const recordingService = require('./recording.service');

module.exports = {
    userService,
    tokenService,
    mailerService,
    noteService,
    googleCalendarService,
    dashboardService,
    clientService,
    promptService,
    waitlistService,
    checklistService,
    configService,
    recordingService
}