const mongoose = require('mongoose');
const { registerUser } = require('./user.service');
const { Waitlist } = require('../models');

// Create
const createWaitlistEntry = async (data) => {
    const entry = await Waitlist.create(data);
    return entry.toObject();
};

// Read (by id)
const getWaitlistEntryById = async (id) => {
    return await Waitlist.findById(id).lean();
};

// Read (all)
const getAllWaitlistEntries = async (filter = {}) => {
    return await Waitlist.find(filter).lean();
};

// Update
const updateWaitlistEntry = async (id, updateData) => {
    return await Waitlist.findByIdAndUpdate(id, updateData, { new: true }).lean();
};

// Delete
const deleteWaitlistEntry = async (id) => {
    return await Waitlist.findByIdAndDelete(id).lean();
};

// Convert multiple waitlist entries to users
const convertMultipleWaitlistsToUsers = async (waitlistIds, approvedByUserId) => {
    const results = [];
    for (const waitlistId of waitlistIds) {
        try {
            const entry = await Waitlist.findById(waitlistId);
            if (!entry) throw new Error('Waitlist entry not found');
            if (entry.status !== 'pending') throw new Error('Entry is not pending');

            // Generate random password
            const randomPassword = Math.random().toString(36).slice(-8);

            // Prepare user data
            const userData = {
                firstName: entry.firstName,
                lastName: entry.lastName,
                email: entry.email,
                phoneNumber: entry.phoneNumber,
                specialty: entry.specialty,
                organization: entry.organization,
                password: randomPassword,
            };

            // Register user
            const user = await registerUser(userData);

            // Update waitlist entry
            entry.status = 'approved';
            entry.approvedAt = new Date();
            entry.approvedBy = approvedByUserId;
            await entry.save();

            results.push({ waitlistId, user, randomPassword, success: true });
        } catch (error) {
            results.push({ waitlistId, error: error.message, success: false });
        }
    }
    return results;
};

// Convert waitlist entry to user
const convertWaitlistToUser = async (waitlistId, approvedByUserId) => {
    const entry = await Waitlist.findById(waitlistId);
    if (!entry) throw new Error('Waitlist entry not found');
    if (entry.status !== 'pending') throw new Error('Entry is not pending');

    // Generate random password
    const randomPassword = Math.random().toString(36).slice(-8);

    // Prepare user data
    const userData = {
        firstName: entry.firstName,
        lastName: entry.lastName,
        email: entry.email,
        phoneNumber: entry.phoneNumber,
        specialty: entry.specialty,
        organization: entry.organization,
        password: randomPassword,
        // Add other required fields for User schema if needed
    };

    // Register user
    const user = await registerUser(userData);

    // Update waitlist entry
    entry.status = 'approved';
    entry.approvedAt = new Date();
    entry.approvedBy = approvedByUserId;
    await entry.save();

    return { user, randomPassword };
};

module.exports = {
    createWaitlistEntry,
    getWaitlistEntryById,
    getAllWaitlistEntries,
    updateWaitlistEntry,
    deleteWaitlistEntry,
    convertWaitlistToUser,
    convertMultipleWaitlistsToUsers,
};