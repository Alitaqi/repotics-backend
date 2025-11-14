const express = require("express");
const router = express.Router();

const { getCrimeHeatmapData } = require("../controllers/heatmapController.js");

router.get("/heatmap", getCrimeHeatmapData);

module.exports = router;