const multer = require('multer');
const path = require('path');
const config = require('../config');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, config.storagePath);
    },
    filename: (req, file, cb) => {
        const userId = req.user ? req.user._id : 'unknownUser';
        const clientName = req.query.name ? req.query.name.trim().replace(/\s+/g, '-') : 'unknownClient';
        const uniqueSuffix = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        cb(null, `${userId}-${clientName}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage });

module.exports = upload;