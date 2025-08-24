const { User, Booking, UserLoginLog, Note } = require('../../models');
const moment = require('moment-timezone');

// Get user attendance between from and to dates
const getUserAttendance = async (fromDate, toDate) => {
    try {
        const startDate = moment(fromDate).startOf('day').toDate();
        const endDate = moment(toDate).endOf('day').toDate();

        // Get all login logs within the date range
        const loginLogs = await UserLoginLog.find({
            loggedInAt: { $gte: startDate, $lte: endDate }
        }).populate('userId', 'firstName lastName email');

        // Group by date and user
        const attendanceByDate = {};
        
        loginLogs.forEach(log => {
            const dateKey = moment(log.loggedInAt).format('YYYY-MM-DD');
            const userId = log.userId._id.toString();
            
            if (!attendanceByDate[dateKey]) {
                attendanceByDate[dateKey] = {};
            }
            
            if (!attendanceByDate[dateKey][userId]) {
                attendanceByDate[dateKey][userId] = {
                    user: log.userId,
                    loginCount: 0
                };
            }
            
            attendanceByDate[dateKey][userId].loginCount++;
        });

        // Convert to array format
        const result = Object.keys(attendanceByDate).map(date => ({
            date,
            users: Object.values(attendanceByDate[date])
        }));

        return result;
    } catch (error) {
        throw error;
    }
};

// Get user statistics
const getUserStatistics = async () => {
    try {
        const users = await User.find({}).select('firstName lastName email');
        const fiveDaysAgo = moment().subtract(5, 'days').startOf('day').toDate();

        const userStats = await Promise.all(users.map(async (user) => {
            // Total bookings created by user (as handler)
            const totalBookings = await Booking.countDocuments({ handler: user._id });

            // Bookings with notes (checking for dictationNote)
            const bookingsWithNotes = await Booking.countDocuments({
                handler: user._id,
                dictationNote: { $exists: true, $ne: null }
            });

            // Bookings in last 5 days
            const bookingsLast5Days = await Booking.find({
                handler: user._id,
                createdAt: { $gte: fiveDaysAgo }
            }).sort({ createdAt: -1 });

            // Group bookings by day for last 5 days
            const bookingsPerDay = {};
            for (let i = 0; i < 5; i++) {
                const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
                bookingsPerDay[date] = 0;
            }

            bookingsLast5Days.forEach(booking => {
                const dateKey = moment(booking.createdAt).format('YYYY-MM-DD');
                if (bookingsPerDay[dateKey] !== undefined) {
                    bookingsPerDay[dateKey]++;
                }
            });

            // Total notes created by user
            const totalNotes = await Note.countDocuments({ user: user._id });

            return {
                user: {
                    _id: user._id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email
                },
                totalBookings,
                bookingsWithNotes,
                bookingsPerDay: Object.entries(bookingsPerDay).map(([date, count]) => ({
                    date,
                    count
                })),
                totalNotes
            };
        }));

        return userStats;
    } catch (error) {
        throw error;
    }
};

module.exports = {
    getUserAttendance,
    getUserStatistics
};