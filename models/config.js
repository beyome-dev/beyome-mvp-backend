// models/Config.js
const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  // "scope" tells you what this config applies to
  scope: {
    type: String,
    enum: ['user', 'organization'], // add more if needed
    required: true
  },

  // For user-level configs
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // For org-level configs
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization'
  },

  role: {
    type: String,
    enum: ['default', 'admin', 'all-users'], // you can extend this
    default: 'default'
  },

  // actual settings
  backgroundColor: { type: String, default: '#FFFFFF' },
  fontColor: { type: String, default: '#000000' },
  promptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Prompt' }],

}, { timestamps: true });

// Example uniqueness indexes
configSchema.index({ scope: 1, user: 1 }, { unique: true, partialFilterExpression: { scope: 'user' } });
configSchema.index({ scope: 1, organization: 1, role: 1 }, { unique: true, partialFilterExpression: { scope: 'organization' } });

module.exports = mongoose.model('Config', configSchema);