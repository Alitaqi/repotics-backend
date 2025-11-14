const mongoose = require("mongoose");
const bcrypt = require("bcrypt");


const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  dob: { type: Date, required: true }, 
  location: { type: String }, // e.g. "F-8, Islamabad"
  coordinates: {
    lat: { type: Number },
    lng: { type: Number }
  },
  bio: { type: String, default: "" },
  profilePicture: { type: String, default: "https://res.cloudinary.com/dd7mk4do3/image/upload/v1755870214/aa_pkajlu.jpg" },
  profilePictureId: { type: String }, // 🔹 Cloudinary public_id for profile pic
  bannerPicture: { type: String, default: "https://res.cloudinary.com/dd7mk4do3/image/upload/v1755870097/c6_bccjnh.png" },
  bannerPictureId: { type: String }, // 🔹 Cloudinary public_id for banner pic
  badges: [{ type: String }],
  // Relationships
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  // metadata
  postsCount: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
}, { timestamps: true });



// Password hashing before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);
module.exports = User;
