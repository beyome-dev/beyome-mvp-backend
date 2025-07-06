const noteController = require('./note.controller');
const authController = require('./auth.controller');
const userController = require('./user.controller');
const clientController = require('./client.controller');
const dashboardController = require('./dashboard.controller');

module.exports = {
    authController,
    userController,
    noteController,
    dashboardController,
    clientController
}