const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const userRoutes = require("./routes/userRoutes");
const postRoutes = require("./routes/postRoutes");
const locationRoutes = require("./routes/locationRoutes.js");
const heatmapRoutes = require("./routes/heatmapRoutes");
const dotenv = require("dotenv");

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://repotics.vercel.app"
  ],
  credentials: true,
}));

// Routes
app.use("/api/users", userRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/crimes", heatmapRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ message: "Server error" });
});

module.exports = app;
