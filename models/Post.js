const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 1000
  },
  upvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  downvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  replies: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      required: true,
      maxlength: 500
    },
    upvotes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    downvotes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const postSchema = new mongoose.Schema(
  {
    // 🔹 General post data
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    description: { type: String }, // AI-generated 
    images: [{ type: String }], // Cloudinary URLs
    tags: [{ type: String }],

    // 🔹 Engagement
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [commentSchema],

    // 🔹 Structured crime report fields
    incidentDescription: { type: String },
    crimeType: { type: String, required: true }, // "Theft", "Fraud", etc
    date: { type: String, required: true }, // stored as YYYY-MM-DD
    time: { type: String, required: true }, // stored as HH:mm
    locationText: { type: String, required: true }, // human-readable
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    anonymous: { type: Boolean, default: false },
    agreed: { type: Boolean, default: false }, // checkbox "I confirm..."

    upvotes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    downvotes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", postSchema);
