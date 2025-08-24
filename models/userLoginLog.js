const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    loggedInAt: { type: Date, default: Date.now }, // precise time
});

module.exports = mongoose.model('UserLoginLog', loginLogSchema);