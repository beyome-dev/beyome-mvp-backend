const noteController = require('./note.controller');
const authController = require('./auth.controller');
const userController = require('./user.controller');
const clientController = require('./client.controller');
const dashboardController = require('./dashboard.controller');
const promptController = require('./prompt.controller');
const waitlistController = require('./waitlist.controller');

module.exports = {
    authController,
    userController,
    noteController,
    dashboardController,
    clientController,
    promptController,
    waitlistController
}