const { dashboardService } = require('../services');

const getDashboardData = async (req, res) => {
    try {
         let { notesParam, timeParam, overviewParam } = req.query;
        const stats = await dashboardService.getDashboardStats(req.user, notesParam, timeParam, overviewParam);
        res.status(200).json(stats);
    } catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
};

module.exports = {
    getDashboardData
};