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

// Dynamic file filter middleware generator
function createUploadMiddleware({ allowedMimeTypes, allowedExtensions, limits }) {
    const fileFilter = (req, file, cb) => {
        if (allowedMimeTypes && !allowedMimeTypes.includes(file.mimetype)) {
            return cb(new Error(`Only files of types: ${allowedMimeTypes.join(', ')} are allowed`), false);
        }
        if (allowedExtensions) {
            const fileExtension = path.extname(file.originalname).toLowerCase();
            if (!allowedExtensions.includes(fileExtension)) {
                return cb(new Error(`Only files with extensions: ${allowedExtensions.join(', ')} are allowed`), false);
            }
        }
        cb(null, true);
    };

    return multer({
        storage,
        fileFilter,
        limits
    });
}



// For profile pictures
const profilePictureUpload = createUploadMiddleware({
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1
    }
});

// General upload (no restrictions)
const upload = multer({ storage });

module.exports = { upload, profilePictureUpload, createUploadMiddleware };