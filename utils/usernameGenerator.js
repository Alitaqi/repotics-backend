const User = require("../models/User");

const generateUsername = async (name) => {
  let base = name.toLowerCase().replace(/\s+/g, ""); // remove spaces
  let username = base;
  let exists = await User.findOne({ username });

  while (exists) {
    const randomNum = Math.floor(Math.random() * 1000);
    username = `${base}${randomNum}`;
    exists = await User.findOne({ username });
  }

  return username;
};

module.exports = generateUsername;

