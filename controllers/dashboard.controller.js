const { dashboardService, mailerService } = require('../services');

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

const sendMail = async (req, res) => {
    try {
        const { template, email, recipientName, subject, data } = req.body;
        if (!email || !subject || !template) {
            return res.status(400).json({ error: "Email, subject, and template are required" });
        }
        await mailerService.sendMail(email, recipientName, subject, template, data);
        res.status(200).json({ message: "Email sent successfully" });
    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ error: "Failed to send email" });
    }
}
module.exports = {
    getDashboardData,
    sendMail
};