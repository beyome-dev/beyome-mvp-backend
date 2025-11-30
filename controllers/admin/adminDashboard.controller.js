const { userService, tokenService, mailerService } = require('../../services');
const adminDashboardService = require('../../services/admin/adminDashboard.services');
const config = require('../../config');

// @desc Get user attendance between from and to dates
// @route GET /api/admin/user-attendance
// @access Admin only
module.exports.getUserAttendance = async (req, res) => {
    try {
        const { from, to, format = 'json' } = req.query;

        // Validate required query parameters
        if (!from || !to) {
            return res.status(400).json({
                success: false,
                message: 'Both "from" and "to" date parameters are required'
            });
        }

        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(from) || !dateRegex.test(to)) {
            return res.status(400).json({
                success: false,
                message: 'Date format should be YYYY-MM-DD'
            });
        }

        // Validate format parameter
        const validFormats = ['json', 'html', 'excel'];
        if (!validFormats.includes(format)) {
            return res.status(400).json({
                success: false,
                message: 'Format must be one of: json, html, excel'
            });
        }

        const attendance = await adminDashboardService.getUserAttendance(from, to);

        // Handle different response formats
        switch (format) {
            case 'html':
                const htmlContent = adminDashboardService.convertToHTML(attendance, 'User Attendance Report');
                res.setHeader('Content-Type', 'text/html');
                res.setHeader('Content-Disposition', 'inline; filename="user-attendance-report.html"');
                return res.send(htmlContent);

            case 'excel':
                const csvContent = adminDashboardService.convertToExcel(attendance, 'User Attendance Report');
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename="user-attendance-report.csv"');
                return res.send(csvContent);

            default: // json
                res.status(200).json({
                    success: true,
                    data: attendance
                });
        }
    } catch (error) {
        console.error('Error in getUserAttendance:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// @desc Get user statistics
// @route GET /api/admin/user-statistics
// @access Admin only
module.exports.getUserStatistics = async (req, res) => {
    try {
        const { from, to, format = 'json' } = req.query;

        // Validate format parameter
        const validFormats = ['json', 'html', 'excel'];
        if (!validFormats.includes(format)) {
            return res.status(400).json({
                success: false,
                message: 'Format must be one of: json, html, excel'
            });
        }

        // Validate date format if provided
        if (from || to) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (from && !dateRegex.test(from)) {
                return res.status(400).json({
                    success: false,
                    message: 'From date format should be YYYY-MM-DD'
                });
            }
            if (to && !dateRegex.test(to)) {
                return res.status(400).json({
                    success: false,
                    message: 'To date format should be YYYY-MM-DD'
                });
            }
        }

        const userStats = await adminDashboardService.getUserStatistics(from, to);

        // Handle different response formats
        switch (format) {
            case 'html':
                const htmlContent = adminDashboardService.convertToHTML(userStats, 'User Statistics Report');
                res.setHeader('Content-Type', 'text/html');
                res.setHeader('Content-Disposition', 'inline; filename="user-statistics-report.html"');
                return res.send(htmlContent);

            case 'excel':
                const csvContent = adminDashboardService.convertToExcel(userStats, 'User Statistics Report');
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename="user-statistics-report.csv"');
                return res.send(csvContent);

            default: // json
                res.status(200).json({
                    success: true,
                    data: userStats
                });
        }
    } catch (error) {
        console.error('Error in getUserStatistics:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// @desc Test individual transcription tools with ad-hoc uploads
// @route POST /api/admin/transcription/test
// @access Admin only
module.exports.testTranscriptionTool = async (req, res) => {
    try {
        const tool = (req.body.tool || '').toLowerCase().trim();

        if (!tool) {
            return res.status(400).json({
                success: false,
                message: '"tool" parameter is required'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Audio file is required. Upload using "audio" field.'
            });
        }

        const result = await adminDashboardService.testTranscriptionTool({
            file: req.file,
            tool,
            requestedBy: req.user?._id
        });

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error in testTranscriptionTool:', error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};