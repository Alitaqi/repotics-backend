const mongoose = require('mongoose');

// Photo Schema
const photoSchema = new mongoose.Schema({
  original: { type: String, required: true },
  cropped: { type: String, required: true },
  cropData: { type: Object, default: null }
});

// Comment Schema
const commentSchema = new mongoose.Schema({
  text: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  downvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  replies: [
    {
      text: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
    downvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
    createdAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

// Main Schema
const missingPersonSchema = new mongoose.Schema(
  {
    // Basic Info
    name: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ["Male", "Female", "Other"], required: true },
    height: { type: String },
    build: { type: String },
    distinguishingMarks: { type: String },

    // Photos
    photos: [photoSchema],

    // Last Seen Info
    lastSeenDate: { type: Date, required: true },
    lastSeenTime: { type: String },
    lastSeenLocation: { type: String, required: true },

    // Additional Details
    clothing: { type: String },
    medical: { type: String },
    details: { type: String },

    // User (Exactly like posts)
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Voting
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    downvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Comments
    comments: [commentSchema],

    // Status
    status: {
      type: String,
      enum: ["Missing", "Found", "Unknown"],
      default: "Missing"
    }
  },
  { timestamps: true }
);

// Virtual fields
missingPersonSchema.virtual("upvoteCount").get(function () {
  return this.upvotes.length;
});

missingPersonSchema.virtual("downvoteCount").get(function () {
  return this.downvotes.length;
});

// Indexes
missingPersonSchema.index({ name: "text", lastSeenLocation: "text" });
missingPersonSchema.index({ status: 1 });
missingPersonSchema.index({ createdAt: -1 });

module.exports = mongoose.model("MissingPerson", missingPersonSchema);
