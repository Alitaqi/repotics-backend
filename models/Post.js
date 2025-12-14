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


// AI Analysis Schema (forensics + summary + extracted data)
const aiReportSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "failed", "processing_summary", "awaiting_user_approval" ,"processing_full_report"],
    default: "pending"
  },

  // --- Public-facing AI output ---
  shortSummary: { type: String },  // user can edit this

  // --- Government / full forensic analysis ---
  fullReport: { type: String }, // long formatted law enforcement report

  // --- AI extracted structured fields ---
  extracted: {
    weapons: [{ type: String }], // ["AK47", "Glock", "Unknown pistol"]
    vehicleTypes: [{ type: String }], // ["Toyota Corolla", "Motorcycle", "Van"]
    licensePlates: [{ type: String }], // OCR
    suspectsCount: { type: Number },
    facesDetected: { type: Number },
    ocrText: { type: String }, // detected environment text (signboards, writing etc.)
  },

  confidenceScore: { type: Number }, // AI confidence (0–1 scale)
  
  reviewedByUser: { type: Boolean, default: false }, // user confirmed summary
  reviewedAt: { type: Date },

}, { timestamps: true });




const postSchema = new mongoose.Schema(
  {
    // User & Create Info
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Public Post Data
    description: { type: String }, 
    images: [{ type: String }],
    tags: [{ type: String }],

    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [commentSchema],

    // Raw user-submitted crime report fields
    incidentDescription: { type: String },
    crimeType: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    locationText: { type: String, required: true },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    anonymous: { type: Boolean, default: false },
    agreed: { type: Boolean, default: false },

    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    downvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // attach the AI report object
    aiReport: aiReportSchema,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", postSchema);
