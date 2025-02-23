const validationMiddleware = require('./validation.middleware');
const authMiddleware = require('./auth.middleware');
const rateLimiter = require('./rateLimiter.middleware');
const upload  = require('./multer.middleware');
const apiKeyMiddleware = require('./apiKey.middleware')

module.exports = {
    validationMiddleware,
    authMiddleware,
    rateLimiter,
    upload,
    apiKeyMiddleware,
}
