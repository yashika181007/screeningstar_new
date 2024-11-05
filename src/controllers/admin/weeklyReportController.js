const WeeklyReport = require("../../models/admin/weeklyReportModel");
const Common = require("../../models/admin/commonModel");

exports.index = (req, res) => {
  const { admin_id, _token } = req.query;

  let missingFields = [];
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = JSON.stringify({ weekly_report: "send" });
  Common.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    Common.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json(err);
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      // Get the current date
      const currentDate = new Date();
      console.log("Current Date:", currentDate.toISOString().split('T')[0]); // Format: YYYY-MM-DD

      // Get the current day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
      const currentDay = currentDate.getDay();
      console.log("Current Day:", currentDay); // Log the current day

      // Calculate the first day (Sunday) and last day (Saturday) of the current week
      const firstDayOfWeek = new Date(currentDate);
      firstDayOfWeek.setDate(currentDate.getDate() - currentDay); // Set to Sunday

      const lastDayOfWeek = new Date(currentDate);
      lastDayOfWeek.setDate(currentDate.getDate() + (6 - currentDay)); // Set to Saturday

      console.log("First Day of Current Week:", firstDayOfWeek.toISOString().split('T')[0]); // Format: YYYY-MM-DD
      console.log("Last Day of Current Week:", lastDayOfWeek.toISOString().split('T')[0]); // Format: YYYY-MM-DD

      WeeklyReport.list((err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ status: false, message: err.message, token: newToken });
        }

        res.json({
          status: true,
          message: "Weekly reports sent successfully",
          token: newToken,
        });
      });
    });
  });
};
