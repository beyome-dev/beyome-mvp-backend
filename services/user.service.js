const { User, Booking } = require('../models');
const bcrypt = require('bcryptjs');
const moment = require('moment-timezone'); // top of file if not already included
const { Note } = require('../models'); // Make sure Note model is imported

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
    newUser.password = undefined;
    newUser.googleTokens = undefined;
    return newUser;
}

const updateUserById = async (id, userData, handler) => {
    if (userData.password) {
        const salt = await bcrypt.genSalt();
        userData.password = await bcrypt.hash(userData.password, salt);
    }
    if (userData.email && (await User.isEmailTaken(userData.email, id))) {
        throw new Error('email is already taken');
    }
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
// Helper function to check if handler is authorized
function isAuthorizedToClient(user, handler) {
    if (handler === null || handler === undefined) {
        return true
    }
    const handlerIdStr = handler._id.toString();
    const userHandlers = (user.handlers || []).map(h => h.toString());
    const orgMatch = user.organization && handler.organization && user.organization.toString() === handler.organization.toString();
    if (handlerIdStr == user._id.toString()) {
        return true; // Handler is the user themselves
    }
    // Therapist can only delete if they are a handler of the user
    if (handler.userType === "therapist" && !userHandlers.includes(handlerIdStr)) {
        return false;
    }
    // Receptionist or org_admin can only delete if in the same organization
    if ((handler.userType === "receptionist" || handler.userType === "org_admin") && !orgMatch) {
        return false;
    }
    // Otherwise, authorized
    return true;
}

const deleteUserById = async (id, handler) => {
    const user = await User.findById(id);
    if (user) {
        // Check if handler is allowed to delete this user
        if (!isAuthorizedToClient(user, handler)) {
            throw new Error('You are not authorized to delete this user');
        }

        await user.remove();
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

const createClient = async (userData, handlerID) => {
    const user  = await User.findOne({email: userData.email });
    if (user) {
        userData.handlers = [handlerID, ...user.handlers]
        return  await user.save();
    }
    userData.handlers = [handlerID]
    userData.password = undefined;
    userData.userType = 'client';
    userData.isAdmin = false
    userData.emailVerfied = false
    userData.hasActivePlan = false
    userData.currentPlan = "none"
    userData.twoFactorAuth = false
    userData.hasResetPassword = false
    const newUser = await User.create(userData);
    return newUser;
}

const getClientNames = async (filter = {}, page = 1, limit = 10) => {
    let query = {};

    if (filter.name) {
        query = {
            $or: [
                { firstName: { $regex: filter.name, $options: 'i' } },
                { lastName: { $regex: filter.name, $options: 'i' } }
            ]
        };
        delete filter.name;
    }

    query = { ...query, ...filter };

    console.log("query", query);
    const skip = (page - 1) * limit;
    let users = await User.find(query)
        .select('firstName lastName email')
        .sort({ visitDate: -1 })
        .skip(skip)
        .limit(limit);
    
    users = users.map(user => {
        return {
            name: `${user.firstName} ${user.lastName}`,
            email: user.email,
            _id: user._id
        };
    });

    const totalCount = await User.countDocuments(query);
    
    return { 
        users, 
        totalPages: Math.ceil(totalCount / limit), 
        currentPage: page, 
        totalCount 
    };
}

const getClientData = async (clientID, handler) => {

    const client  = await User.findById(clientID);
    if (!client) {
        throw new Error('Client not found');
    }

    // Fetch all bookings for the client
    const bookings = await Booking.find({ client: client._id });

    // Fetch all notes for the client
    const notes = await Note.find({ client: client._id });

    const now = moment().tz('Asia/Kolkata'); // current date-time
        const todayStr = now.format("YYYY-MM-DD");
        const currentTimeStr = now.format("HH:mm");

        const stats = await Booking.aggregate([
            {
                $match: {
                    client: client._id,
                    handler: handler._id
                }
            },
            {
                $facet: {
                    revenue: [
                        {
                            $match: {
                                status: { $in: ['completed', 'pending-review'] },
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$sessionCost' }
                            }
                        }
                    ],
                    completedOrPending: [
                        {
                            $match: {
                                status: { $in: ['completed', 'pending-review'] }
                            }
                        },
                        { $count: "count" }
                    ],
                    upcoming: [
                        {
                            $match: {
                                status: 'scheduled',
                                $or: [
                                    { date: { $gt: todayStr } },
                                    {
                                        date: todayStr,
                                        time: { $gte: currentTimeStr }
                                    }
                                ]
                            }
                        },
                        { $count: "count" }
                    ],
                    pendingReview: [
                        { $match: { status: 'pending-review' } },
                        { $count: "count" }
                    ],
                    latestBooking: [
                        { $sort: { date: -1, time: -1 } },
                        { $limit: 1 },
                        { $project: { _id: 0, date: 1, time: 1 } }
                    ]
                }
            }
        ]);

        const result = stats[0] || {};
        let analysis = {}
        analysis.revenue = result.revenue?.[0]?.total || 0;
        analysis.completedOrPendingCount = result.completedOrPending?.[0]?.count || 0;
        analysis.upcomingCount = result.upcoming?.[0]?.count || 0;
        analysis.pendingReviewCount = result.pendingReview?.[0]?.count || 0;

        // Assign lastVisit as joined date and time from latestBooking
        if (result.latestBooking && result.latestBooking[0]) {
            const { date, time } = result.latestBooking[0];
            analysis.lastVisit = date && time ? `${date} ${time}` : null;
        } else {
            analysis.lastVisit = null;
        }


    return {
        client,
        bookings,
        notes,
        analysis
    };
}
const getClients = async (filter = {}, page = 1, limit = 10, handler) => {
    const skip = (page - 1) * limit;
    let users = await User.find(filter).select('firstName lastName email')
    .sort({ visitDate: -1 })
    .skip(skip)
    .limit(limit);
    
    const totalCount = await User.countDocuments(filter);

users = await Promise.all(users.map(async user => {
    try {
        const now = moment().tz('Asia/Kolkata'); // current date-time
        const todayStr = now.format("YYYY-MM-DD");
        const currentTimeStr = now.format("HH:mm");

        const stats = await Booking.aggregate([
            {
                $match: {
                    client: user._id,
                    handler: handler._id
                }
            },
            {
                $facet: {
                    revenue: [
                        {
                            $match: {
                                status: 'completed',
                                sessionCostPaid: true
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$sessionCost' }
                            }
                        }
                    ],
                    completedOrPending: [
                        {
                            $match: {
                                status: { $in: ['completed', 'pending-review'] }
                            }
                        },
                        { $count: "count" }
                    ],
                    upcoming: [
                        {
                            $match: {
                                status: 'scheduled',
                                $or: [
                                    { date: { $gt: todayStr } },
                                    {
                                        date: todayStr,
                                        time: { $gte: currentTimeStr }
                                    }
                                ]
                            }
                        },
                        { $count: "count" }
                    ],
                    pendingReview: [
                        { $match: { status: 'pending-review' } },
                        { $count: "count" }
                    ],
                    latestBooking: [
                        { $sort: { date: -1, time: -1 } },
                        { $limit: 1 },
                        { $project: { _id: 0, date: 1, time: 1 } }
                    ]
                }
            }
        ]);

        const result = stats[0] || {};
        user = user.toObject ? user.toObject() : user;
        user.revenue = result.revenue?.[0]?.total || 0;
        user.completedOrPendingCount = result.completedOrPending?.[0]?.count || 0;
        user.upcomingCount = result.upcoming?.[0]?.count || 0;
        user.pendingReviewCount = result.pendingReview?.[0]?.count || 0;

        console.log(result.latestBooking, "latestBooking");
        // Assign lastVisit as joined date and time from latestBooking
        if (result.latestBooking && result.latestBooking[0]) {
            const { date, time } = result.latestBooking[0];
            user.lastVisit = date && time ? `${date} ${time}` : null;
        } else {
            user.lastVisit = null;
        }

    } catch (error) {
        console.error(`Error processing user ${user._id}:`, error);
        user = user.toObject ? user.toObject() : user;
        user.revenue = 0;
        user.completedOrPendingCount = 0;
        user.upcomingCount = 0;
        user.pendingReviewCount = 0;
        user.lastVisit = null;
    }
    return user;
}));

    return { 
        users, 
        totalPages: Math.ceil(totalCount / limit), 
        currentPage: page, 
        totalCount 
    };
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
    createClient,
    getClients,
    getClientNames,
    getClientData
}