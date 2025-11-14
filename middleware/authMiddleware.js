const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
  console.log("Cookies received:", req.cookies); // Debug
  const token = req.cookies?.token; // read from cookie

  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user from DB
    const user = await User.findById(decoded.id).select("_id username email");
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Attach to req.user
    req.user = {
      id: user._id,
      username: user.username,
      email: user.email,
    };

    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ message: "Token is not valid" });
  }
};

module.exports = { authMiddleware };
