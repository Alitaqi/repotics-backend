// routes/postRoutes.js
const express = require("express");
const router = express.Router();
const {
  createPost,
  getAllPosts,
  getPostById,
  getUserPosts,
  updatePost,
  deletePost,
  upvotePost,
  downvotePost,
  addComment,
  addReply,
  voteComment,
  voteReply,
  deleteComment,
  deleteReply,
  getPersonalizedFeed,
  // toggleLike,
  // addComment,
} = require("../controllers/postController");
const { authMiddleware } = require("../middleware/authMiddleware");
const {upload} = require("../middleware/multer");
const { handleMulterError } = require("../middleware/multer");


router.get("/feed", authMiddleware, getPersonalizedFeed);
// Create post
router.post("/", authMiddleware, upload.array("images", 5), handleMulterError, createPost);

// Get all posts (feed)
router.get("/", getAllPosts);

// Get single post
router.get("/:postId", getPostById);

// Get user posts
router.get("/user/:username", getUserPosts);

// Update post summary
router.put("/:postId", authMiddleware, updatePost);

// Delete post
router.delete("/:postId", authMiddleware, deletePost);

// Voting routes
router.post("/:postId/upvote", authMiddleware, upvotePost);
router.post("/:postId/downvote", authMiddleware, downvotePost);

// Like/unlike
// router.put("/:postId/like", authMiddleware, toggleLike);

// Comment
// router.post("/:postId/comment", authMiddleware, addComment);


//// Comment routes
router.post("/:postId/comments", authMiddleware, addComment);
router.post("/:postId/comments/:commentId/replies", authMiddleware, addReply);
router.post("/:postId/comments/:commentId/vote", authMiddleware, voteComment);
router.post("/:postId/comments/:commentId/replies/:replyId/vote", authMiddleware, voteReply);
router.delete("/:postId/comments/:commentId", authMiddleware, deleteComment);
router.delete("/:postId/comments/:commentId/replies/:replyId", authMiddleware, deleteReply);



module.exports = router;
