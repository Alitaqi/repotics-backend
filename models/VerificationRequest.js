const mongoose = require('mongoose');
const verificationRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // form data
  fullName: String,
  organization: String,
  role: String,
  documentUrl: String, // optional proof

  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  }
}, { timestamps: true });

module.exports = mongoose.model("VerificationRequest", verificationRequestSchema);