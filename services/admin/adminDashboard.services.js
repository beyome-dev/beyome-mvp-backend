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

// Get user statistics with optional date filtering
const getUserStatistics = async (fromDate = null, toDate = null) => {
    try {
        const users = await User.find({}).select('firstName lastName email');
        
        // Default to last 30 days if no dates provided
        let startDate, endDate;
        if (fromDate && toDate) {
            startDate = moment(fromDate).startOf('day').toDate();
            endDate = moment(toDate).endOf('day').toDate();
        } else {
            endDate = moment().endOf('day').toDate();
            startDate = moment().subtract(30, 'days').startOf('day').toDate();
        }

        const userStats = await Promise.all(users.map(async (user) => {
            // Total bookings created by user (as handler) within date range
            const totalBookings = await Booking.countDocuments({ 
                handler: user._id,
                createdAt: { $gte: startDate, $lte: endDate }
            });

            // Bookings with notes (checking for dictationNote) within date range
            const bookingsWithNotes = await Booking.countDocuments({
                handler: user._id,
                dictationNote: { $exists: true, $ne: null },
                createdAt: { $gte: startDate, $lte: endDate }
            });

            // Bookings in last 5 days
            const fiveDaysAgo = moment().subtract(5, 'days').startOf('day').toDate();
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

            // Total notes created by user within date range
            const totalNotes = await Note.countDocuments({ 
                user: user._id,
                createdAt: { $gte: startDate, $lte: endDate }
            });

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
                totalNotes,
                dateRange: {
                    from: moment(startDate).format('YYYY-MM-DD'),
                    to: moment(endDate).format('YYYY-MM-DD')
                }
            };
        }));

        return userStats;
    } catch (error) {
        throw error;
    }
};

// Convert data to HTML format
const convertToHTML = (data, title) => {
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>${title}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { border-collapse: collapse; width: 100%; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            h1 { color: #333; }
            .date { color: #666; font-size: 14px; }
        </style>
    </head>
    <body>
        <h1>${title}</h1>
        <p class="date">Generated on: ${moment().format('YYYY-MM-DD HH:mm:ss')}</p>
    `;

    if (title === 'User Attendance Report') {
        html += '<table><tr><th>Date</th><th>User</th><th>Email</th><th>Login Count</th></tr>';
        data.forEach(dateData => {
            dateData.users.forEach(userData => {
                html += `
                <tr>
                    <td>${dateData.date}</td>
                    <td>${userData.user.firstName} ${userData.user.lastName}</td>
                    <td>${userData.user.email}</td>
                    <td>${userData.loginCount}</td>
                </tr>`;
            });
        });
    } else if (title === 'User Statistics Report') {
        html += '<table><tr><th>User</th><th>Email</th><th>Total Bookings</th><th>Bookings with Notes</th><th>Total Notes</th><th>Date Range</th></tr>';
        data.forEach(userData => {
            html += `
            <tr>
                <td>${userData.user.firstName} ${userData.user.lastName}</td>
                <td>${userData.user.email}</td>
                <td>${userData.totalBookings}</td>
                <td>${userData.bookingsWithNotes}</td>
                <td>${userData.totalNotes}</td>
                <td>${userData.dateRange.from} to ${userData.dateRange.to}</td>
            </tr>`;
        });
    }

    html += '</table></body></html>';
    return html;
};

// Convert data to Excel format (CSV)
const convertToExcel = (data, title) => {
    let csv = '';
    
    if (title === 'User Attendance Report') {
        csv = 'Date,User Name,Email,Login Count\n';
        data.forEach(dateData => {
            dateData.users.forEach(userData => {
                csv += `${dateData.date},"${userData.user.firstName} ${userData.user.lastName}","${userData.user.email}",${userData.loginCount}\n`;
            });
        });
    } else if (title === 'User Statistics Report') {
        csv = 'User Name,Email,Total Bookings,Bookings with Notes,Total Notes,Date Range\n';
        data.forEach(userData => {
            csv += `"${userData.user.firstName} ${userData.user.lastName}","${userData.user.email}",${userData.totalBookings},${userData.bookingsWithNotes},${userData.totalNotes},"${userData.dateRange.from} to ${userData.dateRange.to}"\n`;
        });
    }
    
    return csv;
};

module.exports = {
    getUserAttendance,
    getUserStatistics,
    convertToHTML,
    convertToExcel
};