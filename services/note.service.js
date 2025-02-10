const jwt = require('jsonwebtoken');
const config = require('../config');


const maxAge = config.jwt.maxAge || 365 * 24 * 60 * 60; //3 * 24 * 60 * 60;
const jwtSecret = config.jwt.secret;


const generateNote = async (opts) => {
    const user = await User.findOne(opts).select('-password');
    if (user) {
        return user;
    }
    throw new Error('user not found');
}

module.exports = {
    createToken,
    verifyToken,
}