# repotics-backend

🔄 Typical Flow in Node.js + Express MVC
1. Client makes a request
Example:
POST /api/users/register
with body:
{ "name": "Ali", "email": "ali@example.com", "password": "123456" }
-------------------------------------------------------------------
2. Routes decide what controller to call
📂 routes/userRoutes.js
const express = require("express");
const { registerUser, loginUser } = require("../controllers/userController");
const router = express.Router();

// URL: /api/users/register
router.post("/register", registerUser);

// URL: /api/users/login
router.post("/login", loginUser);

module.exports = router;

👉 So, Express sees the request /api/users/register and calls registerUser in the controller.
-------------------------------------------------------------------
3. Controller contains business logic

📂 controllers/userController.js

const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const registerUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      res.status(400);
      return res.json({ message: "User already exists" });
    }

    // Create user
    const user = await User.create({ name, email, password });

    // Response
    res.status(201).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      token: jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "1d" }),
    });
  } catch (error) {
    next(error); // 👈 send to error middleware
  }
};

module.exports = { registerUser };


👉 Controller = “what to do when this request happens” (business logic).
-------------------------------------------------------------------
4. Model talks to database

📂 models/User.js

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
});

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model("User", userSchema);


👉 Controller asked for a User.create(...).
👉 Model handles it using Mongoose and saves the user to MongoDB.
-------------------------------------------------------------------
5. Middleware runs before/after controllers

Middleware are like “traffic cops” that run in between requests.

Request middleware → modifies/validates request before hitting controller.

Error middleware → catches errors from controllers.

📂 middleware/errorMiddleware.js

const errorHandler = (err, req, res, next) => {
  res.status(res.statusCode || 500).json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

module.exports = { errorHandler };
-------------------------------------------------------------------

📂 app.js

app.use("/api/users", userRoutes); // 👈 routes
app.use(errorHandler); // 👈 error middleware (runs last)
-------------------------------------------------------------------
6. Response sent back

If successful → JSON response with data + token.

If error → handled by errorHandler middleware.

-------------------------------------------------------------------

🚦 Analogy

Routes = Road signs (which way to go).

Controllers = Police officers (decide what happens at that route).

Models = Database clerks (store/fetch/update data).

Middleware = Security checkpoints (check ID, catch mistakes, log requests)-------------------------------------------------------------------