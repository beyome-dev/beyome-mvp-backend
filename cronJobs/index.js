const saladCheck = require('./saladCheck.cronJob');
const fileManager = require('./fileManager.cronJob');
const bookingCronJob = require('./booking.cronJob');

module.exports = {
    saladCheck,
    fileManager,
    bookingCronJob
}