const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const { getCrimeHeatmapData,
        getCityWiseCrimeStats,
        getCrimeTypeDistribution,
        getCrimeTrendStats,
        getAllReports,
        getPatrolInsights
 } = require("../controllers/heatmapController.js");

router.get("/heatmap", getCrimeHeatmapData);

router.get("/city-stats", getCityWiseCrimeStats);
router.get("/crime-type-distribution", getCrimeTypeDistribution);
router.get("/crime-trend", getCrimeTrendStats);

// Combined endpoint for all reports
router.get("/all-reports", getAllReports);

router.get("/patrol-insights", authMiddleware, getPatrolInsights);

module.exports = router;