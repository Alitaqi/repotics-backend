// routes/postRoutes.js
const express = require("express");
const router = express.Router();
const {
    getAllMissingPersons,
    getMissingPersonById,
    createMissingPerson,
    updateMissingPerson,
    deleteMissingPerson,
    addReply,
    addComment,
    voteComment,
    voteReply,
    deleteComment,
    deleteReply,
    upvoteMissingPerson,
    downvoteMissingPerson

} = require("../controllers/missingPersonController");
const { authMiddleware } = require("../middleware/authMiddleware");
const {upload} = require("../middleware/multer");
const { handleMulterError } = require("../middleware/multer");


router.get("/", getAllMissingPersons);      // Get all missing persons
router.get("/:id", getMissingPersonById);   //  Get single missing person
router.post("/", authMiddleware, upload.array("photos", 5), handleMulterError, createMissingPerson);    // Create new report
router.put("/:id", authMiddleware, upload.array("images", 5), updateMissingPerson); // Update report 
router.delete("/:id", authMiddleware, deleteMissingPerson); // Delete report

router.post("/:id/comments", authMiddleware, addComment);   // Add comment
router.post("/:id/comments/:commentId/replies", authMiddleware, addReply); // Add reply to comment
router.post('/:id/comments/:commentId/vote', authMiddleware, voteComment);
router.post('/:id/comments/:commentId/replies/:replyId/vote', authMiddleware, voteReply);
router.delete('/:id/comments/:commentId', authMiddleware, deleteComment);
router.delete('/:id/comments/:commentId/replies/:replyId', authMiddleware, deleteReply);
router.post('/:id/upvote', authMiddleware, upvoteMissingPerson);
router.post('/:id/downvote', authMiddleware, downvoteMissingPerson);



module.exports = router;
