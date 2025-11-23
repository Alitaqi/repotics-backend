const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: false, // disable auto-creation of indexes in production for performance
      maxPoolSize: 10,  // maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // throw error if no server within 5s
      socketTimeoutMS: 45000, // close sockets after 45s of inactivity
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
// This module exports a function to connect to MongoDB using Mongoose.
// It handles connection errors and logs the connection status.
// The connection settings are optimized for production use.
// Make sure to set the MONGO_URI environment variable before running the application.
// This code is part of the repotics-backend configuration for database connectivity.
// It is essential to ensure that the MongoDB server is running and accessible.