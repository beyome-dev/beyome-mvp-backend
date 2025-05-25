const { User, Booking } = require('../models');
const bcrypt = require('bcryptjs');
const moment = require('moment'); // top of file if not already included

const getUsers = async (id) => {
    const users = await User.find({}).select('-password');
    return users;
}

const getUserById = async (id) => {
    const user = await User.findById(id).select('-password');
    if (user) {
        return user;
    }
    throw new Error('user not found');
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

const updateUserById = async (id, userData) => {
    if (userData.password) {
        const salt = await bcrypt.genSalt();
        userData.password = await bcrypt.hash(userData.password, salt);
    }
    if (userData.email && (await User.isEmailTaken(userData.email, id))) {
        throw new Error('email is already taken');
    }
    const user = await User.findByIdAndUpdate(id, userData);
    if (user) {
        user.password = undefined;
        user.googleTokens = undefined;
        return user;
    }
    throw new Error('user not found');
}

const deleteUserById = async (id) => {
    const user = await User.findById(id);
    if (user) {
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

const getClients = async (filter = {}, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
    const users = await User.find(filter)
    .sort({ visitDate: -1 })
    .skip(skip)
    .limit(limit);
    
    const totalCount = await User.countDocuments(filter);
    
    return { 
        users, 
        totalPages: Math.ceil(totalCount / limit), 
        currentPage: page, 
        totalCount 
    };
}

const getClientData = async (filter = {}, page = 1, limit = 10, handler) => {
    const skip = (page - 1) * limit;
    let users = await User.find(filter).select('firstName lastName email')
    .sort({ visitDate: -1 })
    .skip(skip)
    .limit(limit);
    
    const totalCount = await User.countDocuments(filter);

users = await Promise.all(users.map(async user => {
    try {
        const now = moment(); // current date-time
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
    getClientData
}