const mongoose = require('mongoose');
const { validate } = require('./note');
const Schema = mongoose.Schema;

const ClientSchema = new Schema({
    firstName: {
        type: String
    },
    lastName: {
        type: String
    },
    nickName: {
        type: String
    },
    anonymous: {
        type: Boolean,
        default: false,
    },
    email: {
        type: String,
        lowercase: true,
    },
    phone: {
        type: String,
        validate: {
            validator: (v) => {
                return /^(\+?\d+)$/.test(v);
            },
            message: (props) => `${props.value} is not a valid phone number`
        }
    },
    handler: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    organization: {
        type: String,
    },
    picture: {
        type: String,
    },
    clientType: {
        type: String,
        enum: [
            'individual',
            'family',
            'couple',
            'enterprise',
            'group', 
          ],
          default: 'individual'
    },
    emailVerfied: {
        type: Boolean,
        default: false,
    },
    clientSummary: {
        type: String,
    },
    googleTokens: {
        access_token: String,
        refresh_token: String,
        scope: String,
        token_type: String,
        expiry_date: Number,
    },
    tags:   {
        type: [String],
        default: []
    },
}, { timestamps: true });

ClientSchema.statics.isEmailTaken = async function (email, excludeClientId) {
    const client = await this.findOne({ handler, email, _id: { $ne: excludeClientId } });
    return !!client;
};

const Client = mongoose.model('Client', ClientSchema);

module.exports = Client;