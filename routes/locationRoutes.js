// routes/locationRoutes.js
const express = require("express");
const { searchLocations, reverseGeocode } = require("../controllers/locationController");

const router = express.Router();

router.get("/search", searchLocations);
router.get("/reverse", reverseGeocode);

module.exports = router;  
