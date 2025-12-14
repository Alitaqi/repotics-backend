// routes/userRoutes.js
const express = require("express");
const {upload} = require("../middleware/multer");
const router = express.Router();
const { 
registerUser, 
loginUser, 
logoutUser, 
checkUsername, 
getUserProfile,
getMe,
checkFollowStatus, 
followUser,       
unfollowUser,
unfollowOtherUser,
updateProfilePicture,
updateBannerPicture,
updateBio,
updateName,
updateLocation,
updatePassword,
} = require("../controllers/userController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { handleMulterError } = require("../middleware/multer");
const { get } = require("mongoose");

//  Auth routes
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);

//  Username check
router.get("/check-username", checkUsername);

//  Me route (protected)
router.get("/me", authMiddleware, getMe);

//  Profile route (protected)
router.get("/profile/:username", authMiddleware, getUserProfile);

//  Follow routes (protected)
router.get("/profile/:username/follow-status", authMiddleware, checkFollowStatus);
router.post("/profile/:username/follow", authMiddleware, followUser);
router.post("/profile/:username/unfollow", authMiddleware, unfollowUser);
router.post("/unfollow-user/:username", authMiddleware, unfollowOtherUser);

//  Update Profile Picture (protected)
router.put(
  "/profile/update-profile-picture",
  authMiddleware,
  upload.single("profilePicture"),
  updateProfilePicture
);

router.put(
  "/profile/update-banner-picture",
  authMiddleware,
  upload.single("bannerPicture"),
  updateBannerPicture
);

// Update Name (protected)
router.put("/profile/update-name", authMiddleware, updateName);

// Update Location (protected)
router.put("/profile/update-location", authMiddleware, updateLocation);

// Update Password (protected)
router.put("/profile/update-password", authMiddleware, updatePassword);
router.put("/profile/update-bio", authMiddleware, updateBio);


module.exports = router;
