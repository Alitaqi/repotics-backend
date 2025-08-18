const app = require("./app"); // Express app
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./config/db");

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for now, restrict later
    credentials: true,
  },
});

// Socket.IO connection
io.on("connection", (socket) => {
  console.log(`⚡ User connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`❌ User disconnected: ${socket.id}`);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
