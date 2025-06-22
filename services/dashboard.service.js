// services/dashboard.service.js
const Booking = require('../models/booking');
const moment = require('moment-timezone');

const calculateGrowth = (current, previous) => {
    if (previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / previous) * 100;
};

const getDashboardStats = async (user, notesParam = 'month', timeParam = 'month', overviewParam = 'month') => {
    const momentIST = moment().tz('Asia/Kolkata');
    const commonFilter = user.userType === "receptionist" || user.userType === "org_admin"
        ? { organization: user.organization }
        : { handler: user._id };

    const getDateRange = (param) => {
        switch(param) {
            case 'day':
                return {
                    start: momentIST.startOf('day').format('YYYY-MM-DD'),
                    end: momentIST.endOf('day').format('YYYY-MM-DD')
                };
            case 'month':
                return {
                    start: momentIST.startOf('month').format('YYYY-MM-DD'),
                    end: momentIST.endOf('month').format('YYYY-MM-DD')
                };
            case 'year':
                return {
                    start: momentIST.startOf('year').format('YYYY-MM-DD'),
                    end: momentIST.endOf('year').format('YYYY-MM-DD')
                };
            default:
                return {
                    start: momentIST.startOf('day').format('YYYY-MM-DD'),
                    end: momentIST.endOf('day').format('YYYY-MM-DD')
                };
        }
    };

    const notesRange = getDateRange(notesParam);
    const timeRange = getDateRange(timeParam);
    const overviewRange = getDateRange(overviewParam);

    const today = momentIST.format('YYYY-MM-DD');
    const yesterday = momentIST.subtract(1, 'days').format('YYYY-MM-DD');
    const startOfCurrentMonth = momentIST.startOf('month').format('YYYY-MM-DD');
    const endOfCurrentMonth = momentIST.endOf('month').format('YYYY-MM-DD');
    const startOfLastMonth = momentIST.subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
    const endOfLastMonth = momentIST.subtract(1, 'month').endOf('month').format('YYYY-MM-DD');

    const [
        todaySessions,
        todayCompleted,
        todayNoShows,
        todayProjected,
        todayRevenue,
        yesterdayRevenue,
        currentMonthSessions,
        lastMonthSessions,
        currentMonthCompleted,
        lastMonthCompleted,
        currentMonthDropOff,
        lastMonthDropOff,
        currentMonthProjected,
        currentMonthRevenue,
        lastMonthRevenue,
        completedWithNotes,
        completedWithoutNotes,
        averageSessionTimeRaw,
        upcomingSessions,
        recentSessions,
        appointmentStatusOverviewRaw
    ] = await Promise.all([
        Booking.countDocuments({ ...commonFilter, date: today }),
        Booking.countDocuments({ ...commonFilter, date: today, status: {$in: ['completed', 'pending-review','generating-note']}  }),
        Booking.countDocuments({ ...commonFilter, date: today, status: 'no-show' }),
        Booking.aggregate([
            { $match: { ...commonFilter, date: today } },
            { $group: { _id: null, total: { $sum: '$sessionCost' } } }
        ]),
        Booking.aggregate([
            { $match: { ...commonFilter, date: today, status: {$in: ['completed', 'pending-review','generating-note']} } },
            { $group: { _id: null, total: { $sum: '$sessionCost' } } }
        ]),
        Booking.aggregate([
            { $match: { ...commonFilter, date: yesterday, status: {$in: ['completed', 'pending-review','generating-note']} } },
            { $group: { _id: null, total: { $sum: '$sessionCost' } } }
        ]),
        Booking.countDocuments({ ...commonFilter, date: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth } }),
        Booking.countDocuments({ ...commonFilter, date: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),
        Booking.countDocuments({ ...commonFilter, date: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth }, status: {$in: ['completed', 'pending-review','generating-note']} }),
        Booking.countDocuments({ ...commonFilter, date: { $gte: startOfLastMonth, $lte: endOfLastMonth }, status: {$in: ['completed', 'pending-review','generating-note']} }),
        Booking.countDocuments({
            ...commonFilter,
            date: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth },
            status: { $in: ['no-show', 'cancelled'] }
        }),
        Booking.countDocuments({
            ...commonFilter,
            date: { $gte: startOfLastMonth, $lte: endOfLastMonth },
            status: { $in: ['no-show', 'cancelled'] }
        }),
        Booking.aggregate([
            { $match: { ...commonFilter, date: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth }, } },
            { $group: { _id: null, total: { $sum: '$sessionCost' } } }
        ]),
        Booking.aggregate([
            { $match: { ...commonFilter, date: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth }, status: {$in: ['completed', 'pending-review','generating-note']} } },
            { $group: { _id: null, total: { $sum: '$sessionCost' } } }
        ]),
        Booking.aggregate([
            { $match: { ...commonFilter, date: { $gte: startOfLastMonth, $lte: endOfLastMonth }, status: {$in: ['completed', 'pending-review','generating-note']} } },
            { $group: { _id: null, total: { $sum: '$sessionCost' } } }
        ]),
        Booking.countDocuments({ ...commonFilter, date: { $gte: notesRange.start, $lte: notesRange.end }, status: 'completed', dictationNote: { $exists: true, $ne: null } }),
        Booking.countDocuments({ ...commonFilter, date: { $gte: notesRange.start, $lte: notesRange.end }, status: 'pending-review', dictationNote: { $exists: false } }),
        Booking.aggregate([
            { $match: { ...commonFilter, date: { $gte: timeRange.start, $lte: timeRange.end }, status: {$in: ['completed', 'pending-review','generating-note']}, checkInTime: { $exists: true }, checkOutTime: { $exists: true } } },
            { $project: { duration: { $subtract: ['$checkOutTime', '$checkInTime'] } } },
            { $group: { _id: null, avgDuration: { $avg: '$duration' }, shortestDuration: { $min: '$duration' }, longestDuration: { $max: '$duration' } } }
        ]),
        Booking.find({ ...commonFilter, date: today }).sort({ time: 1 }).limit(5),
        Booking.find({ ...commonFilter, date: { $lte: today } }).sort({ date: -1, time: -1 }).limit(5),
        Booking.aggregate([
            { $match: { ...commonFilter, date: { $gte: overviewRange.start, $lte: overviewRange.end } } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ])
    ]);

    const projectedTotal = todayProjected[0]?.total || 0;
    const revenueToday = todayRevenue[0]?.total || 0;
    const revenueYesterday = yesterdayRevenue[0]?.total || 0;

    const monthlyProjectedTotal = currentMonthProjected[0]?.total || 0;
    const revenueCurrentMonth= currentMonthRevenue[0]?.total || 0;
    const revenuePrevioudMonth= lastMonthRevenue[0]?.total || 0;

    const appointmentStatusOverview = appointmentStatusOverviewRaw.reduce((acc, status) => {
        acc[status._id] = status.count;
        return acc;
    }, {});

    const avgSessionTimeMs = averageSessionTimeRaw[0]?.avgDuration || 0;
    const avgSessionTimeMinutes = avgSessionTimeMs ? avgSessionTimeMs / (1000 * 60) : 0;
    const shortestDurationMs = averageSessionTimeRaw[0]?.shortestDuration || 0;
    const longestDurationMs = averageSessionTimeRaw[0]?.longestDuration || 0;

    return {
        sessionsToday: todaySessions,
        completedToday: todayCompleted,
        noShowsToday: todayNoShows,
        todaysRevenue: {
            totalProjected: projectedTotal,
            currentRevenue: revenueToday,
            percentageGrowthFromYesterday: calculateGrowth(revenueToday, revenueYesterday)
        },
        monthlySessions: {
            current: currentMonthSessions,
            previous: lastMonthSessions,
            growth: calculateGrowth(currentMonthSessions, lastMonthSessions)
        },
        monthlyCompleted: {
            current: currentMonthCompleted,
            previous: lastMonthCompleted,
            growth: calculateGrowth(currentMonthCompleted, lastMonthCompleted)
        },
        monthlyDropOff: {
            current: currentMonthDropOff,
            previous: lastMonthDropOff,
            growth: calculateGrowth(currentMonthDropOff, lastMonthDropOff)
        },
        montlyRevenue: {
            totalProjected: monthlyProjectedTotal,
            currentRevenue: revenueCurrentMonth,
            percentageGrowthFromYesterday: calculateGrowth(revenueCurrentMonth, revenuePrevioudMonth)
        },
        notesCompletion: {
            withNotes: completedWithNotes,
            withoutNotes: completedWithoutNotes,
            completionRate: (completedWithNotes + completedWithoutNotes) === 0 ? 0 : (completedWithNotes / (completedWithNotes + completedWithoutNotes)) * 100
        },
        averageSessionTimeMinutes: avgSessionTimeMinutes,
        sessionDurationBreakdown: {
            shortest: shortestDurationMs ? shortestDurationMs / (1000 * 60) : 0,
            average: avgSessionTimeMinutes,
            longest: longestDurationMs ? longestDurationMs / (1000 * 60) : 0
        },
        upcomingSessions: upcomingSessions.map(b => ({
            id: b._id,
            date: b.date,
            time: b.time,
            client: b.customerName,
            status: b.status,
            visitType: b.visitType,
            tags: b.personalNotes,
            appointmentType: b.appointmentType
        })),
        recentSessions: recentSessions.map(b => ({
            id: b._id,
            time: b.time,
            date: b.date,
            client: b.customerName,
            status: b.status,
            amount: b.sessionCost,
        })),
        appointmentStatusOverview
    };
};

module.exports = {
    getDashboardStats
};