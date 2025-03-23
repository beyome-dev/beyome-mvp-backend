const saladCheck = require('./saladCheck.cronJob');
const fileManager = require('./fileManager.cronJob');

module.exports = {
    saladCheck,
    fileManager
}