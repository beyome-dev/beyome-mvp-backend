const cron = require('node-cron');
const Booking = require('../models/booking'); // Adjust path as needed
const moment = require('moment-timezone');

const processRunningJobs = async () => {
    try {
        // Get yesterday's date in IST (format: YYYY-MM-DD)
        const yesterdayIST = moment().tz('Asia/Kolkata').subtract(1, 'day').format('YYYY-MM-DD');

        // Find bookings with status 'scheduled' and date equal to yesterday
        const bookings = await Booking.find({
            status: 'scheduled',
            date: yesterdayIST
        });

        // Update all found bookings to 'no-show'
        await Booking.updateMany(
            { status: 'scheduled', date: yesterdayIST },
            { $set: { status: 'no-show' } }
        );

        console.log(`Updated ${bookings.length} bookings to no-show for ${yesterdayIST}`);
    } catch (error) {
        console.error('Error processing running jobs:', error.message);
    }
};

// Schedule the cron job to run every day at 1AM IST
const startCronJob = (io) => {
    cron.schedule('0 1 * * *', () => processRunningJobs(io), {
        scheduled: true,
        timezone: 'Asia/Kolkata'
    });
};

module.exports = startCronJob;