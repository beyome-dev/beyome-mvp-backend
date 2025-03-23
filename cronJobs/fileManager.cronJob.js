const cron = require('node-cron');
const axios = require('axios');
const mongoose = require('mongoose');
const config = require('../config');
const Note = require('../models/note'); // Adjust path as needed
const {noteService} = require('../services'); // Adjust path as needed


// Schedule the cron job to run every 1 minute
const startCronJob = () => {
    cron.schedule('0 0 * * 0', () => {
        console.log('Running cron job to delete upload files...');
        const fs = require('fs');
        const path = require('path');

        const uploadsDir = path.join(__dirname, '../uploads');

        fs.readdir(uploadsDir, (err, files) => {
            if (err) {
                console.error('Error reading uploads directory:', err);
                return;
            }

            files.forEach(file => {
                const filePath = path.join(uploadsDir, file);
                fs.unlink(filePath, err => {
                    if (err) {
                        console.error(`Error deleting file ${file}:`, err);
                    } else {
                        console.log(`Deleted file: ${file}`);
                    }
                });
            });
        });
    }, {
        scheduled: true,
        timezone: 'UTC'
    });
};
module.exports = startCronJob;