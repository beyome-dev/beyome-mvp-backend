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

// File filter for profile pictures
const profilePictureFilter = (req, file, cb) => {
    // Check file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    
    if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
    }
    
    // Check file extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
        return cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
    }
    
    cb(null, true);
};

// General upload configuration
const upload = multer({ storage });

// Profile picture specific upload configuration
const profilePictureUpload = multer({
    storage: storage,
    fileFilter: profilePictureFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1 // Only allow 1 file
    }
});

module.exports = { upload, profilePictureUpload };