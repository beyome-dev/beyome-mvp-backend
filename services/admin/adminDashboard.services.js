const { User, Booking, UserLoginLog, Note } = require('../../models');
const moment = require('moment-timezone');
const path = require('path');
const fs = require('fs').promises;
const config = require('../../config');
const { requestTranscription, TRANSCRIPTION_CONFIG } = require('../audioProcessing/transcribeAudio.service');
const { uploadRecordingToBucket, deleteRecordingFromBucket } = require('../storage/googleCloudStorage.service');

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

// Test transcription tools with ad-hoc admin upload (no DB writes)
const testTranscriptionTool = async ({ file, tool, requestedBy }) => {
    if (!file) {
        const error = new Error('Audio file upload is required');
        error.statusCode = 400;
        throw error;
    }

    if (!tool || !TRANSCRIPTION_CONFIG[tool]) {
        const error = new Error(`Invalid "tool" parameter. Use one of: ${Object.keys(TRANSCRIPTION_CONFIG).join(', ')}`);
        error.statusCode = 400;
        throw error;
    }

    const recordingId = `admin_test_${Date.now()}`;
    const filePath = path.join(config.storagePath, file.filename);
    const attemptStartedAt = new Date();
    let cloudUploadResult = null;

    try {
        try {
            cloudUploadResult = await uploadRecordingToBucket({
                localPath: file.path,
                recordingId,
                filename: file.originalname || file.filename,
                mimetype: file.mimetype
            });

            if (cloudUploadResult?.publicUrl) {
                file.cloudStorageUrl = cloudUploadResult.publicUrl;
                file.cloudStorageObject = cloudUploadResult.objectName;
                file.gcsUri = cloudUploadResult.gcsUri;
            }
        } catch (cloudError) {
            console.error('[Admin Test] Failed to upload audio to cloud storage:', cloudError.message);
        }

        const transcriptionResult = await requestTranscription(file, recordingId, {
            preferredTool: tool,
            enableFallback: false,
            maxAttempts: 1
        });

        return {
            recordingPreview: buildRecordingPreview({
                file,
                tool,
                transcriptionResult,
                attemptStartedAt
            }),
            transcriptionResult,
            meta: {
                requestedBy,
                tool,
                availableTools: Object.keys(TRANSCRIPTION_CONFIG)
            }
        };
    } catch (error) {
        throw error;
    } finally {
        await deleteFileIfExists(filePath);
        if (cloudUploadResult?.objectName) {
            try {
                await deleteRecordingFromBucket(cloudUploadResult.objectName);
            } catch (err) {
                console.error('[Admin Test] Failed to delete cloud audio object:', err.message);
            }
        }
    }
};

const deleteFileIfExists = async (targetPath) => {
    if (!targetPath) return;
    try {
        await fs.unlink(targetPath);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('Failed to delete admin test audio file:', err.message);
        }
    }
};

const buildRecordingPreview = ({ file, tool, transcriptionResult, attemptStartedAt }) => {
    const now = new Date();
    const extension = path.extname(file.originalname || '').replace('.', '').toLowerCase();
    const mimeFormat = (file.mimetype || '').split('/')[1];
    const resolvedFormat = (extension || mimeFormat || '').toLowerCase() || null;

    const transcriptionStatus = transcriptionResult.transcriptionStatus || 'completed';
    const attemptNumber = transcriptionResult.transcriptionMetadata?.attemptNumber || 1;

    return {
        _id: null,
        sessionId: null,
        therapistId: null,
        recordingType: 'admin_transcription_test',
        filename: file.filename,
        filePath: file.cloudStorageUrl || path.join(config.storagePath, file.filename),
        audioUrl: file.cloudStorageUrl || `${config.APP_URL}/files/${file.filename}`,
        audioKey: file.cloudStorageObject || null,
        duration: transcriptionResult.duration || 0,
        fileSize: file.size,
        format: resolvedFormat,
        transcriptionStatus,
        transcriptionText: transcriptionResult.transcriptionText || '',
        transcriptionAttempts: [
            {
                attemptNumber,
                tool,
                status: transcriptionStatus === 'completed' ? 'success' : 'failed',
                startedAt: attemptStartedAt,
                completedAt: now,
                duration: now - attemptStartedAt,
                batchProcessed: Boolean(transcriptionResult.transcriptionMetadata?.batchProcessed),
                chunkCount: transcriptionResult.transcriptionMetadata?.chunkCount
            }
        ],
        transcriptionMetadata: transcriptionResult.transcriptionMetadata,
        transcriptionError: transcriptionStatus === 'completed' ? null : {
            message: 'Transcription did not complete successfully',
            code: 'TRANSCRIPTION_FAILED',
            timestamp: now,
            tool
        },
        retryConfig: {
            maxRetries: TRANSCRIPTION_CONFIG[tool]?.maxRetries || 1,
            currentRetry: attemptNumber,
            preferredTool: tool,
            fallbackEnabled: false
        },
        summary: null,
        summaryMetadata: null,
        recordedAt: now,
        createdAt: now,
        updatedAt: now
    };
};

module.exports = {
    getUserAttendance,
    getUserStatistics,
    convertToHTML,
    convertToExcel,
    testTranscriptionTool
};