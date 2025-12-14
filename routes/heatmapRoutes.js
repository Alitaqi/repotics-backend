const express = require("express");
const router = express.Router();

const { getCrimeHeatmapData,
        getCityWiseCrimeStats,
        getCrimeTypeDistribution,
        getCrimeTrendStats,
        getAllReports
 } = require("../controllers/heatmapController.js");

router.get("/heatmap", getCrimeHeatmapData);

router.get("/city-stats", getCityWiseCrimeStats);
router.get("/crime-type-distribution", getCrimeTypeDistribution);
router.get("/crime-trend", getCrimeTrendStats);
// Combined endpoint for all reports
router.get("/all-reports", getAllReports);

module.exports = router;