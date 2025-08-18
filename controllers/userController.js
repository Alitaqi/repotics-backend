const User = require("../models/User");
const generateUsername = require("../utils/usernameGenerator");
const jwt = require("jsonwebtoken");

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
    sameSite: "strict",
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
    sameSite: "strict",
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

module.exports = { registerUser, loginUser, logoutUser, checkUsername };

