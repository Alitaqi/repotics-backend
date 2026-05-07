const express = require("express");
const router = express.Router();

const {
  submitVerificationRequest,
  getVerificationRequests,
  approveVerification,
  rejectVerification,
} = require("../controllers/userController"); 

const { authMiddleware } = require("../middleware/authMiddleware");

// USER
router.post("/request", authMiddleware, submitVerificationRequest);

// ADMIN (ali1)
router.get("/requests", authMiddleware, getVerificationRequests);
router.patch("/:id/approve", authMiddleware, approveVerification);
router.patch("/:id/reject", authMiddleware, rejectVerification);

module.exports = router;