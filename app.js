const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const userRoutes = require("./routes/userRoutes");
const dotenv = require("dotenv");

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: "http://localhost:5173", // your frontend URL
  credentials: true,
}));

// Routes
app.use("/api/users", userRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ message: "Server error" });
});

module.exports = app;
