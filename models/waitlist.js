const mongoose = require('mongoose');

const waitlistSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 64,
    },
    lastName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 64,
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true,
        maxlength: 128,
    },
    phone: {
        type: String,
        required: true,
        trim: true,
        maxlength: 20,
    },
    specialty: {
        type: String,
        required: true,
        trim: true,
        maxlength: 64,
    },
    organization: {
        type: String,
        trim: true,
        maxlength: 128,
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    approvedAt: {
        type: Date,
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, { timestamps: true });

module.exports = mongoose.model('Waitlist', waitlistSchema);