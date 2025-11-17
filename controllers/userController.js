const User = require("../models/User");
const generateUsername = require("../utils/usernameGenerator");
const jwt = require("jsonwebtoken");
const cloudinary = require("../utils/cloudinary");
const fs = require("fs");
const bcrypt = require("bcrypt");

// Create JWT token
const createToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// Signup
const registerUser = async (req, res) => {
  const { name, email, password, dob, username } = req.body;

  // Check age >= 16
  const birthDate = new Date(dob);
  const ageDifMs = Date.now() - birthDate.getTime();
  const ageDate = new Date(ageDifMs);
  const age = Math.abs(ageDate.getUTCFullYear() - 1970);

  if (age < 16) {
    return res.status(400).json({ message: "You must be at least 16 years old" });
  }

  // Check email already exists
  const emailExists = await User.findOne({ email });
  if (emailExists) return res.status(400).json({ message: "Email already exists" });

  // Generate username if not provided
  let finalUsername = username || await generateUsername(name);

  const user = await User.create({
    name,
    email,
    username: finalUsername,
    password,
    dob,
  });

  // Send JWT in HTTP-only cookie
  const token = createToken(user._id);
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: none,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.status(201).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    username: user.username,
  });
};

// Login
const loginUser = async (req, res) => {
  try {
  const { credential, password } = req.body; // credential can be email or username

   if (!credential || !password) {
      return res.status(400).json({ message: "Credential and password are required" });
    }
  const user = await User.findOne({
    $or: [{ email: credential }, { username: credential }],
  });

  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  
  // Compare password
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({ message: "Incorrect password" });
  }
  // Send JWT in cookie
  const token = createToken(user._id);
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: none,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    _id: user._id,
    name: user.name,
    email: user.email,
    username: user.username,
  });
  }catch (error) {
      console.error("Login Error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// Logout
const logoutUser = (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out successfully" });
};

// Check username availability
const checkUsername = async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ message: "Username is required" });

    const exists = await User.findOne({ username: username.toLowerCase() });
    res.json({ available: !exists });
  } catch (error) {
    console.error("Username Check Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const Post = require("../models/Post");


const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (error) {
    console.error("Get Me Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get user profile (basic info only, no posts here)
const getUserProfile = async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username })
      .select("-password")
      .populate("followers", "username profilePicture")
      .populate("following", "username profilePicture");

    if (!user) return res.status(404).json({ message: "User not found" });

    const isOwner = req.user && req.user.username === username;
    // Format dob to "day month year" (e.g., "10 May 2000")
    const dob = user.dob 
      ? new Date(user.dob).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })
      : null;


    res.json({
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      dob,
      bio: user.bio || "Vigilante by night. Billionaire by day.",
      location: user.location || "Pakistan",
      profilePicture: user.profilePicture,
      bannerPicture: user.bannerPicture,
      badges: user.badges || "Pakistan",
      followersCount: user.followers.length,
      followingCount: user.following.length,
      followers: user.followers, // populated list
      following: user.following, // populated list
      postsCount: user.postsCount,
      isOwner,
      verified: user.verified || false,
    });
  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Check if current user follows a profile
const checkFollowStatus = async (req, res) => {
  try {
    const { username } = req.params;
    const targetUser = await User.findOne({ username });
    
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const isFollowing = targetUser.followers.includes(req.user.id);
    res.json({ isFollowing });
  } catch (error) {
    console.error("Check Follow Status Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Follow a user
const followUser = async (req, res) => {
  try {
    const { username } = req.params;
    const targetUser = await User.findOne({ username });
    const currentUser = await User.findById(req.user.id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if already following
    if (targetUser.followers.includes(req.user.id)) {
      return res.json({ 
        success: true, 
        message: "Already following this user" 
      });
    }

    // Add to target user's followers
    targetUser.followers.push(req.user.id);
    await targetUser.save();

    // Add to current user's following
    currentUser.following.push(targetUser.id);
    await currentUser.save();

    res.json({ 
      success: true, 
      message: "Successfully followed user",
      followersCount: targetUser.followers.length
    });
  } catch (error) {
    console.error("Follow User Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Unfollow a user
// Unfollow a user
const unfollowUser = async (req, res) => {
  try {
    const { username } = req.params;
    const targetUser = await User.findOne({ username });
    const currentUser = await User.findById(req.user.id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Debug logs with null-safe checks
    console.log("🔎 DEBUG Unfollow Start");
    console.log("req.user.id:", req.user.id.toString());
    console.log("targetUser._id:", targetUser._id.toString());

    console.log(
      "targetUser.followers:",
      (targetUser.followers || []).map(f => f ? f.toString() : "null")
    );
    console.log(
      "currentUser.following:",
      (currentUser.following || []).map(f => f ? f.toString() : "null")
    );

    // Remove from target user's followers (null safe)
    targetUser.followers = (targetUser.followers || []).filter(
      (followerId) =>
        followerId && followerId.toString() !== req.user.id.toString()
    );
    await targetUser.save();

    // Remove from current user's following (null safe)
    currentUser.following = (currentUser.following || []).filter(
      (followingId) =>
        followingId && followingId.toString() !== targetUser._id.toString()
    );
    await currentUser.save();

    console.log("✅ Unfollow success");

    res.json({
      success: true,
      message: "Successfully unfollowed user",
      followersCount: targetUser.followers.length,
    });
  } catch (error) {
    console.error("❌ Unfollow User Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};



// Profile owner unfollows someone else (using username)
const unfollowOtherUser = async (req, res) => {
  try {
    const { username } = req.params; // username of the person to unfollow
    const currentUser = await User.findById(req.user._id);
    const targetUser = await User.findOne({ username });

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Remove target user from current user's following
    currentUser.following = currentUser.following.filter(
      followingId => !followingId.equals(targetUser._id)
    );
    await currentUser.save();

    // Remove current user from target user's followers
    targetUser.followers = targetUser.followers.filter(
      followerId => !followerId.equals(req.user._id)
    );
    await targetUser.save();

    res.json({ 
      success: true, 
      message: "Successfully unfollowed user"
    });
  } catch (error) {
    console.error("Unfollow Other User Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// 🔹 Update Profile Picture with deletion
const updateProfilePicture = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const user = await User.findById(req.user.id);

    // If old picture exists (not default), delete it
    if (user.profilePictureId) {
      await cloudinary.uploader.destroy(user.profilePictureId);
    }

    // Upload new one
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "profile_pictures",
    });

    fs.unlinkSync(req.file.path);

    user.profilePicture = result.secure_url;
    user.profilePictureId = result.public_id;
    await user.save();

    res.json({
      success: true,
      message: "Profile picture updated successfully",
      profilePicture: user.profilePicture,
    });
  } catch (error) {
    console.error("Update Profile Picture Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔹 Update Banner Picture with deletion
const updateBannerPicture = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const user = await User.findById(req.user.id);

    if (user.bannerPictureId) {
      await cloudinary.uploader.destroy(user.bannerPictureId);
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "banner_pictures",
    });

    fs.unlinkSync(req.file.path);

    user.bannerPicture = result.secure_url;
    user.bannerPictureId = result.public_id;
    await user.save();

    res.json({
      success: true,
      message: "Banner picture updated successfully",
      bannerPicture: user.bannerPicture,
    });
  } catch (error) {
    console.error("Update Banner Picture Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔹 Update Bio
const updateBio = async (req, res) => {
  try {
    const { bio } = req.body;
    if (!bio) return res.status(400).json({ message: "Bio is required" });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { bio },
      { new: true }
    ).select("-password");

     if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      success: true,
      message: "Bio updated successfully",
      bio: user.bio,
    });
  } catch (error) {
    console.error("Update Bio Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


const updateName = async (req, res) => {
  try {
    const { name } = req.body;
    console.log("Update Name Request Body:", req.body);
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    // fetch user by ID from token
    const user = await User.findById(req.user.id); 
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.name = name;
    await user.save();

    res.json({ success: true, message: "Name updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ Update Location
const updateLocation = async (req, res) => {
  try {
    const { location, coordinates } = req.body;
    console.log("req.user:", req.user);

    if (!location || !coordinates)
      return res.status(400).json({ message: "Location and coordinates are required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.location = location;
    user.coordinates = coordinates;
    await user.save();

    res.json({ success: true, message: "Location updated", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ Update Password
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Both current and new passwords are required" });
    }

    // Fetch user with password
    const user = await User.findById(req.user.id).select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });

    // Use the existing matchPassword method
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Assign new password (pre-save hook will hash it automatically)
    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Update Password Error:", error);
    res.status(500).json({ message: error.message });
  }
};




module.exports = {
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
};
