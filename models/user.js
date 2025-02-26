const mongoose = require('mongoose');
const { validate } = require('./note');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: [true, 'Please enter an email'],
        unique: true,
        lowercase: true,
    },
    phone: {
        type: String,
        unique: true,
        validate: {
            validator: (v) => {
                return /^\d{10}$/.test(v);
            },
            message: (props) => `${props.value} is not a valid phone number!`
        }
    },
    password: {
        type: String,
    },
    office_location: {
        type: String,
    },
    specialy: {
        type: String,
    },
    picture: {
        type: String,
    },
    isDoctor: {
        type: Boolean,
        default: true,
    },
    isAdmin: {
        type: Boolean,
        default: false,
    },
    emailVerfied: {
        type: Boolean,
        default: false,
    },
    hasActivePlan: {
        type: Boolean,
        default: false,
    },
    currentPlan: {
        type: String,
    },
    twoFactorAuth: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

UserSchema.statics.isEmailTaken = async function (email, excludeUserId) {
    const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
    return !!user;
};

const User = mongoose.model('user', UserSchema);

module.exports = User;