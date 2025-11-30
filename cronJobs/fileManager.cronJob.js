const cron = require('node-cron');
const axios = require('axios');
const mongoose = require('mongoose');
const config = require('../config');
const Note = require('../models/note'); // Adjust path as needed
const {noteService} = require('../services'); // Adjust path as needed
const { Recording, Session  } = require('../models');


// Schedule the cron job to run every 1 minute
const startCronJob = () => {
    cron.schedule('0 0 * * 0', async () => {
        console.log('Running cron job to delete processed note audio files...');
        const fs = require('fs');
        const path = require('path');

        const uploadsDir = path.join(__dirname, '../uploads');

        try {
            // Find notes that have finished processing (adjust query as needed)
            const processedRecordings = await Recording.find({ status: 'completed', filePath: { $exists: true, $ne: null }, inputContentType: 'audio' });

            for (const recording of processedRecordings) {
                if (!recording.filePath || /^https?:\/\//.test(recording.filePath)) {
                    continue;
                }
                const audioFileName = recording.filename;
                const audioFilePath = path.join(uploadsDir, audioFileName);

                try {
                    await fs.promises.access(audioFilePath, fs.constants.F_OK);
                    await fs.promises.unlink(audioFilePath);
                    console.log(`Deleted audio file: ${audioFileName}`);

                    // Remove audioFile from note and save
                    recording.filePath = null;
                    recording.filename = null;
                    await recording.save();
                } catch (err) {
                    if (err.code !== 'ENOENT') {
                        console.error(`Error deleting audio file ${audioFileName}:`, err);
                    }
                }
            }
        } catch (err) {
            console.error('Error during cron job:', err);
        }
    }, {
        scheduled: true,
        timezone: 'UTC'
    });
};
module.exports = startCronJob;