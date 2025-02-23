// middlewares/apiKey.middleware.js

const config = require('../config'); // Assuming you store secrets here

const apiKeyMiddleware = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== config.apiKey) {
        return res.status(401).json({ message: 'Unauthorized: Invalid API Key' });
    }

    next();
};

module.exports = apiKeyMiddleware;