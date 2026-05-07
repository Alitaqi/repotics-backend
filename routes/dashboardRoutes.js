// routes/dashboardRoutes.js
const express = require("express");
const {upload} = require("../middleware/multer");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const { handleMulterError } = require("../middleware/multer");
const { get } = require("mongoose");
const {
    getCrimeByTimeOfDay,getCrimeReportsByMonth, getTopCrimeTypesLast30Days, getMissingPersonsByAgeGroup, getMissingPersonsByGenderOverTime, getMissingPersonsByStatus,
    getTopCrimeCities, getDashboardKPIs, getCrimeReports, getPostById, updatePostStatus, getCrimeStats, getMissingPersons, updateMissingPersonStatus, getMissingPersonById, getMissingPersonStats
 } = require("../controllers/dashboardController");



router.get("/crime-reports-by-month", authMiddleware, getCrimeReportsByMonth);
router.get("/crime-by-time-of-day", authMiddleware, getCrimeByTimeOfDay);
router.get("/top-crime-types", authMiddleware, getTopCrimeTypesLast30Days);
router.get("/missing-by-age", authMiddleware, getMissingPersonsByAgeGroup);
router.get("/missing-by-gender-trend", authMiddleware, getMissingPersonsByGenderOverTime);
router.get("/missing-by-status", authMiddleware, getMissingPersonsByStatus);
router.get("/top-crime-cities", authMiddleware, getTopCrimeCities);
router.get("/kpis", authMiddleware, getDashboardKPIs);
router.get("/crime-reports", authMiddleware, getCrimeReports);
router.get("/post/:id", authMiddleware, getPostById);
router.patch("/posts/:id/status", authMiddleware, updatePostStatus);
router.get("/stats", authMiddleware, getCrimeStats);
router.get("/missing-persons", authMiddleware, getMissingPersons);
router.patch("/missing-persons/:id/status", authMiddleware , updateMissingPersonStatus);
router.get("/missing-persons/stats", authMiddleware, getMissingPersonStats);
router.get("/missing-persons/:id", authMiddleware, getMissingPersonById);


module.exports = router;  
