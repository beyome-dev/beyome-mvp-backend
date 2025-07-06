const { User, Booking } = require('../models');
const bcrypt = require('bcryptjs');
const moment = require('moment-timezone');
const calendatService = require("./utilityServices/google/googleCalendar.service");

const getUsers = async (id) => {
    const users = await User.find({}).select('-password');
    return users;
}

const getUserById = async (id, handler) => {
   let user = await User.findById(id);
    if (!user) {
        throw new Error('user not found');
    }
    if (!isAuthorizedToClient(user, handler)) {
        throw new Error('You are not authorized to edit this user');
    }
    return user;
}

const getUserByOpts = async (opts) => {
    const user = await User.findOne(opts).select('-password -googleTokens');
    if (user) {
        return user;
    }
    throw new Error('user not found');
}

const registerUser = async (userData) => {
    const user = await User.findOne({ email: userData.email });
    if (user) {
        throw new Error('email already exists');
    }

    const salt = await bcrypt.genSalt();
    userData.password = await bcrypt.hash(userData.password, salt);

    const newUser = await User.create(userData);
    let userObj = newUser.toObject();
    delete userObj.password;
    delete userObj.googleTokens;
    return userObj;
}

const updateUserById = async (id, userData, handler) => {
    if (userData.password) {
        const salt = await bcrypt.genSalt();
        userData.password = await bcrypt.hash(userData.password, salt);
    }
    // if (userData.email && (await User.isEmailTaken(userData.email, id))) {
    //     throw new Error('email is already taken');
    // }
    let user = await User.findById(id);
    if (!user) {
        throw new Error('user not found');
    }
    if (!isAuthorizedToClient(user, handler)) {
        throw new Error('You are not authorized to edit this user');
    }
    if (handler != null && handler != undefined && handler._id.toString() != user._id.toString()) {
        if(userData.password) {
            throw new Error('You cannot change the password of another user');
        }
    }
    user = await User.findByIdAndUpdate(id, userData);
    if (user) {
        user.password = undefined;
        user.googleTokens = undefined;
        return user;
    }
    throw new Error('user not found');
}

const deleteUserById = async (id, handler) => {
    const user = await User.findById(id);
    if (user) {
        // Check if handler is allowed to delete this user
        if (!isAuthorizedToClient(user, handler)) {
            throw new Error('You are not authorized to delete this user');
        }
        if (user.handlers && user.handlers.length > 1) {
            // Remove handler._id from user's handlers array and update user
            user.handlers = user.handlers.filter(
                h => h.toString() !== handler._id.toString()
            );
            await user.save();
        } else if (user.handlers && user.handlers.length === 1) {
            await User.findByIdAndDelete(id);
        }
        // Delete all bookings for this user
        let bookings = await Booking.find({ client: id, handler: handler._id })
        await Booking.deleteMany({client: id, handler: handler._id});
        bookings = bookings.map(booking => {
                if (booking.googleEventId !== "" && handler.googleTokens?.access_token) {
                    calendatService.removeBookingEvent(booking.googleEventId, handler.googleTokens)
                }
        });

        return user;
    }
    throw new Error('user not found');
}

const loginWithEmailAndPassword = async (email, password) => {
    const user = await User.findOne({ email });
    if (user) {
        const auth = user.password ? await bcrypt.compare(password, user.password) : null;
        if (auth) {
            user.password = undefined;
            return user;
        }
        throw new Error('incorrect password');
    }
    throw new Error('email not registered');
}

const registerWithThirdParty = async (userData) => {
    const user = await User.findOne({ email: userData.email }).select('-password -googleTokens');
    if (user) {
        return user;
    }
    const newUser = await User.create(userData);
    return newUser;
}

const updatePasswordWithoutOld = async (id, newPassword) => {
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const user = await User.findByIdAndUpdate(id, { password: hashedPassword, hasResetPassword: true });
    if (user) {
        return user;
    }
    throw new Error('user not found');
}

// Helper function to check if handler is authorized
function isAuthorizedToClient(client, handler) {
    if (handler === null || handler === undefined) {
        return true
    }
    const handlerIdStr = handler._id.toString();
    const clientHandlers = (client.handlers || []).map(h => h.toString());
    const orgMatch = client.organization && handler.organization && client.organization.toString() === handler.organization.toString();
    if (handlerIdStr == client._id.toString()) {
        return true; // Handler is the client themselves
    }
    // Therapist can only delete if they are a handler of the client
    if (handler.clientType === "therapist" && !clientHandlers.includes(handlerIdStr)) {
        return false;
    }
    // Receptionist or org_admin can only delete if in the same organization
    if ((handler.clientType === "receptionist" || handler.clientType === "org_admin") && !orgMatch) {
        return false;
    }
    // Otherwise, authorized
    return true;
}

module.exports = {
    getUsers,
    getUserById,
    getUserByOpts,
    registerUser,
    loginWithEmailAndPassword,
    registerWithThirdParty,
    updateUserById,
    deleteUserById,
    updatePasswordWithoutOld,
}