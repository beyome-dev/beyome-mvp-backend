// services/dashboardService.js
const Booking = require('../models/booking');
const moment = require('moment');

const calculateGrowth = (current, previous) => {
    if (previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / previous) * 100;
};

const getDashboardStats = async () => {
    const today = moment().format('YYYY-MM-DD');
    const yesterday = moment().subtract(1, 'days').format('YYYY-MM-DD');
    const startOfCurrentMonth = moment().startOf('month').format('YYYY-MM-DD');
    const endOfCurrentMonth = moment().endOf('month').format('YYYY-MM-DD');
    const startOfLastMonth = moment().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
    const endOfLastMonth = moment().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');

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
    ] = await Promise.all([
        Booking.countDocuments({ date: today }),
        Booking.countDocuments({ date: today, status: 'completed' }),
        Booking.countDocuments({ date: today, status: 'no-show' }),
        Booking.aggregate([
            { $match: { date: today } },
            { $group: { _id: null, total: { $sum: '$sessionCost' } } }
        ]),
        Booking.aggregate([
            { $match: { date: today, status: 'completed', sessionCostPaid: true } },
            { $group: { _id: null, total: { $sum: '$sessionCost' } } }
        ]),
        Booking.aggregate([
            { $match: { date: yesterday, status: 'completed', sessionCostPaid: true } },
            { $group: { _id: null, total: { $sum: '$sessionCost' } } }
        ]),
        Booking.countDocuments({ date: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth } }),
        Booking.countDocuments({ date: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),
        Booking.countDocuments({ date: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth }, status: 'completed' }),
        Booking.countDocuments({ date: { $gte: startOfLastMonth, $lte: endOfLastMonth }, status: 'completed' }),
        Booking.countDocuments({
            date: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth },
            status: { $in: ['no-show', 'cancelled'] }
        }),
        Booking.countDocuments({
            date: { $gte: startOfLastMonth, $lte: endOfLastMonth },
            status: { $in: ['no-show', 'cancelled'] }
        }),
        Booking.aggregate([
            { $match: {  date: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth }, } },
            { $group: { _id: null, total: { $sum: '$sessionCost' } } }
        ]),
        Booking.aggregate([
            { $match: {  date: { $gte: startOfCurrentMonth, $lte: endOfCurrentMonth }, status: 'completed', sessionCostPaid: true } },
            { $group: { _id: null, total: { $sum: '$sessionCost' } } }
        ]),
        Booking.aggregate([
            { $match: { date: { $gte: startOfLastMonth, $lte: endOfLastMonth }, status: 'completed', sessionCostPaid: true } },
            { $group: { _id: null, total: { $sum: '$sessionCost' } } }
        ]),
    ]);

    const projectedTotal = todayProjected[0]?.total || 0;
    const revenueToday = todayRevenue[0]?.total || 0;
    const revenueYesterday = yesterdayRevenue[0]?.total || 0;

    const monthlyProjectedTotal = currentMonthProjected[0]?.total || 0;
    const revenueCurrentMonth= currentMonthRevenue[0]?.total || 0;
    const revenuePrevioudMonth= lastMonthRevenue[0]?.total || 0;

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
    };
};

module.exports = {
    getDashboardStats
};