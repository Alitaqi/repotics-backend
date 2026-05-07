// controllers/notificationController.js
const Notification = require("../models/Notifications");

// GET notifications
const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user.id,
    })
      .populate("sender", "username profilePicture")
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: "Error fetching notifications" });
  }
};

// MARK AS READ
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notif = await Notification.findById(id);
    if (!notif) return res.status(404).json({ message: "Not found" });

    if (notif.recipient.toString() !== req.user.id.toString())
      return res.status(403).json({ message: "Unauthorized" });

    notif.isRead = true;
    await notif.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const markAllRead = async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user.id },
    { isRead: true }
  );

  res.json({ success: true });
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllRead,
};