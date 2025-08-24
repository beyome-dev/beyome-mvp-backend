const { userService, tokenService, mailerService } = require('../../services');
const adminDashboardService = require('../../services/admin/adminDashboard.services');
const config = require('../../config');

// @desc Get user attendance between from and to dates
// @route GET /api/admin/user-attendance
// @access Admin only
module.exports.getUserAttendance = async (req, res) => {
    try {
        const { from, to } = req.query;

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

        const attendance = await adminDashboardService.getUserAttendance(from, to);

        res.status(200).json({
            success: true,
            data: attendance
        });
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
        const userStats = await adminDashboardService.getUserStatistics();

        res.status(200).json({
            success: true,
            data: userStats
        });
    } catch (error) {
        console.error('Error in getUserStatistics:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};