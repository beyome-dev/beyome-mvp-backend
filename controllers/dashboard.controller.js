const { dashboardService } = require('../services');

const getDashboardData = async (req, res) => {
    try {
        const stats = await dashboardService.getDashboardStats();
        res.status(200).json(stats);
    } catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
};

module.exports = {
    getDashboardData
};