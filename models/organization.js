const mongoose = require("mongoose");

const OrganizationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
    email: { type: String },
    website: { type: String },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, {
    timestamps: true
});

module.exports = mongoose.model("Organization", OrganizationSchema);