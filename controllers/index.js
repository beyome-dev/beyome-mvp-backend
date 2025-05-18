const noteController = require('./note.controller');
const authController = require('./auth.controller');
const userController = require('./user.controller');
const dashboardController = require('./dashboard.controller');

module.exports = {
    authController,
    userController,
    noteController,
    dashboardController
}