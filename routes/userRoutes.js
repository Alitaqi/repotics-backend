const express = require("express");
const router = express.Router();
const { registerUser, loginUser, logoutUser, checkUsername } = require("../controllers/userController");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.get("/check-username", checkUsername);

module.exports = router;
