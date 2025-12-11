const cloudinary = require("../utils/cloudinary");
const User = require("../models/User");
const streamifier = require("streamifier");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const haversine = require("haversine-distance");
const MissingPerson = require("../models/MissingPerson");
const multer = require('multer');


// Configure Cloudinary (you'll need to set up your own account)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper function to upload to Cloudinary
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'missing-persons',
        transformation: [
          { quality: 'auto', fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// @desc    Get all missing persons
// @route   GET /api/missing-persons
// @access  Public
exports.getAllMissingPersons = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { lastSeenLocation: { $regex: search, $options: 'i' } },
        { details: { $regex: search, $options: 'i' } }
      ];
    }

    // Sorting
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const missingPersons = await MissingPerson.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v')
      .lean();

    const total = await MissingPerson.countDocuments(query);

    res.status(200).json({
      success: true,
      count: missingPersons.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: missingPersons
    });
  } catch (error) {
    console.error('Get all missing persons error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get single missing person by ID
// @route   GET /api/missing-persons/:id
// @access  Public
exports.getMissingPersonById = async (req, res) => {
  try {
    const missingPerson = await MissingPerson.findById(req.params.id)
    .populate('comments.user', 'name username profilePicture verified')
    .populate('comments.replies.user', 'name username profilePicture verified')
    .select('-__v');

    if (!missingPerson) {
      return res.status(404).json({
        success: false,
        message: 'Missing person not found'
      });
    }

    res.status(200).json({
      success: true,
      data: missingPerson
    });
  } catch (error) {
    console.error('Get missing person by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Create new missing person report
// @route   POST /api/missing-persons
// @access  Private
exports.createMissingPerson = async (req, res) => {
  try {
    const {
      name,
      age,
      gender,
      height,
      build,
      distinguishingMarks,
      lastSeenDate,
      lastSeenTime,
      lastSeenLocation,
      clothing,
      medical,
      details
    } = req.body;

    // Validate required fields
    if (!name || !age || !gender || !lastSeenDate || !lastSeenLocation) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Upload images to Cloudinary
    let photos = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const result = await uploadToCloudinary(file.buffer);
          photos.push({
            original: result.secure_url,
            cropped: result.secure_url,
            cropData: null
          });
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
          return res.status(500).json({
            success: false,
            message: 'Error uploading images'
          });
        }
      }
    }

    // Create missing person
    const missingPersonData = {
      name,
      age: parseInt(age),
      gender,
      height,
      build,
      distinguishingMarks,
      lastSeenDate: new Date(lastSeenDate),
      lastSeenTime,
      lastSeenLocation,
      clothing,
      medical,
      details,
      photos,
      reportedBy: req.user.id,
      status: 'Missing'
    };

    const missingPerson = await MissingPerson.create(missingPersonData);

    res.status(201).json({
      success: true,
      message: 'Missing person report created successfully',
      data: missingPerson
    });
  } catch (error) {
    console.error('Create missing person error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update missing person report
// @route   PUT /api/missing-persons/:id
// @access  Private (Owner or Admin)
// Fixed updateMissingPerson controller
// exports.updateMissingPerson = async (req, res) => {
//   try {
//     const missingPerson = await MissingPerson.findById(req.params.id);
//     if (!missingPerson) {
//       return res.status(404).json({ success: false, message: 'Missing person not found' });
//     }

//     // Owner/Admin check - Handle both possible structures
//     const reportedByUserId = missingPerson.reportedBy?.userId || missingPerson.reportedBy;
//     if (
//       reportedByUserId?.toString() !== req.user.id.toString() &&
//       req.user.role !== 'admin'
//     ) {
//       return res.status(403).json({ success: false, message: 'Not authorized' });
//     }

//     // UPDATABLE FIELDS
//     const updatableFields = [
//       'name', 'age', 'gender', 'height', 'build', 'distinguishingMarks',
//       'lastSeenDate', 'lastSeenTime', 'lastSeenLocation',
//       'clothing', 'medical', 'details', 'status'
//     ];

//     updatableFields.forEach(field => {
//       if (req.body[field] !== undefined) {
//         missingPerson[field] =
//           field === 'age'
//             ? parseInt(req.body[field])
//             : field === 'lastSeenDate'
//             ? new Date(req.body[field])
//             : req.body[field];
//       }
//     });

//     // Handle removed photos
//     if (req.body.removedPhotos) {
//       const removedIds = Array.isArray(req.body.removedPhotos) 
//         ? req.body.removedPhotos 
//         : [req.body.removedPhotos];
      
//       missingPerson.photos = missingPerson.photos.filter(
//         photo => !removedIds.includes(photo._id.toString())
//       );
//     }

//     // Add new photos if uploaded
//     if (req.files && req.files.length > 0) {
//       const newPhotos = req.files.map(file => ({
//         original: file.path,
//         cropped: file.path,
//         cropData: null,
//       }));

//       // Append new photos to existing ones
//       missingPerson.photos = [...missingPerson.photos, ...newPhotos];
//     }

//     await missingPerson.save();

//     res.status(200).json({
//       success: true,
//       message: 'Updated successfully',
//       data: missingPerson
//     });
//   } catch (error) {
//     console.error('Update error:', error);
//     res.status(500).json({ success: false, message: 'Server error', error: error.message });
//   }
// };

// @desc    Update missing person report
// @route   PUT /api/missing-persons/:id
// @access  Private (Owner or Admin)
exports.updateMissingPerson = async (req, res) => {
  try {
    const missingPerson = await MissingPerson.findById(req.params.id);
    if (!missingPerson) {
      return res.status(404).json({ success: false, message: 'Missing person not found' });
    }

    // Owner/Admin check - Handle both possible structures
    const reportedByUserId = missingPerson.reportedBy?.userId || missingPerson.reportedBy;
    if (
      reportedByUserId?.toString() !== req.user.id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // UPDATABLE FIELDS
    const updatableFields = [
      'name', 'age', 'gender', 'height', 'build', 'distinguishingMarks',
      'lastSeenDate', 'lastSeenTime', 'lastSeenLocation',
      'clothing', 'medical', 'details', 'status'
    ];

    // Update fields from req.body (form fields sent via FormData)
    updatableFields.forEach(field => {
      if (req.body[field] !== undefined) {
        missingPerson[field] =
          field === 'age'
            ? parseInt(req.body[field])
            : field === 'lastSeenDate'
            ? new Date(req.body[field])
            : req.body[field];
      }
    });

    // Handle removed photos - check for array or single value
    if (req.body.removedPhotos) {
      let removedIds = [];
      
      if (Array.isArray(req.body.removedPhotos)) {
        removedIds = req.body.removedPhotos;
      } else if (typeof req.body.removedPhotos === 'string') {
        // Handle string format from form data
        try {
          removedIds = JSON.parse(req.body.removedPhotos);
        } catch {
          removedIds = [req.body.removedPhotos];
        }
      }
      
      // Filter out removed photos
      missingPerson.photos = missingPerson.photos.filter(
        photo => !removedIds.includes(photo._id?.toString())
      );
    }

    // Add new photos if uploaded
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(async (file) => {
        try {
          const result = await uploadToCloudinary(file.buffer);
          return {
            original: result.secure_url,
            cropped: result.secure_url,
            cropData: null,
            publicId: result.public_id
          };
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
          throw new Error('Error uploading images');
        }
      });

      const newPhotos = await Promise.all(uploadPromises);
      missingPerson.photos = [...missingPerson.photos, ...newPhotos];
    }

    await missingPerson.save();

    // Populate necessary fields for response
    await missingPerson.populate('reportedBy', 'name username profilePicture verified');

    res.status(200).json({
      success: true,
      message: 'Updated successfully',
      data: missingPerson
    });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Fixed deleteMissingPerson controller
exports.deleteMissingPerson = async (req, res) => {
  try {
    const missingPerson = await MissingPerson.findById(req.params.id);

    if (!missingPerson) {
      return res.status(404).json({
        success: false,
        message: 'Missing person not found'
      });
    }

    // Handle both possible reportedBy structures
    const reportedByUserId = missingPerson.reportedBy?.userId || missingPerson.reportedBy;
    
    if (!reportedByUserId) {
      return res.status(500).json({
        success: false,
        message: 'Invalid report structure'
      });
    }

    // Check if user is owner or admin
    if (reportedByUserId.toString() !== req.user.id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this report'
      });
    }

    // Delete images from Cloudinary if needed
    // Uncomment and implement if using Cloudinary
    // if (missingPerson.photos && missingPerson.photos.length > 0) {
    //   for (const photo of missingPerson.photos) {
    //     await cloudinary.uploader.destroy(photo.publicId);
    //   }
    // }

    await missingPerson.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Missing person report deleted successfully'
    });
  } catch (error) {
    console.error('Delete missing person error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

//================ COMMENTS ====================

// Add comment to missing person
exports.addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const missingPerson = await MissingPerson.findById(id);
    if (!missingPerson) {
      return res.status(404).json({ message: "Missing person not found" });
    }

    const newComment = {
      user: req.user.id,
      text: text.trim(),
      upvotes: [],
      downvotes: [],
      replies: []
    };

    missingPerson.comments.push(newComment);
    await missingPerson.save();

    // Populate the new comment with user data
    await missingPerson.populate('comments.user', 'name username profilePicture verified');
    
    const addedComment = missingPerson.comments[missingPerson.comments.length - 1];
    
    res.status(201).json({
      success: true,
      message: "Comment added successfully",
      comment: addedComment
    });
  } catch (error) {
    console.error("Add Comment Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Add reply to comment
exports.addReply = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ message: "Reply text is required" });
    }

    const missingPerson = await MissingPerson.findById(id);
    if (!missingPerson) {
      return res.status(404).json({ message: "Missing person not found" });
    }

    const comment = missingPerson.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const newReply = {
      user: req.user.id,
      text: text.trim(),
      upvotes: [],
      downvotes: []
    };

    comment.replies.push(newReply);
    await missingPerson.save();

    // Populate the reply with user data
    await missingPerson.populate('comments.replies.user', 'name username profilePicture verified');
    
    const addedReply = comment.replies[comment.replies.length - 1];
    
    res.status(201).json({
      success: true,
      message: "Reply added successfully",
      reply: addedReply
    });
  } catch (error) {
    console.error("Add Reply Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Vote on comment (upvote/downvote)
exports.voteComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { type } = req.body; // 'upvote' or 'downvote'
    const userId = req.user.id;

    if (!['upvote', 'downvote'].includes(type)) {
      return res.status(400).json({ message: "Invalid vote type" });
    }

    const missingPerson = await MissingPerson.findById(id);
    if (!missingPerson) {
      return res.status(404).json({ message: "Missing person not found" });
    }

    const comment = missingPerson.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const alreadyUpvoted = comment.upvotes.includes(userId);
    const alreadyDownvoted = comment.downvotes.includes(userId);

    if (type === 'upvote') {
      if (alreadyUpvoted) {
        comment.upvotes.pull(userId);
      } else {
        comment.upvotes.push(userId);
        if (alreadyDownvoted) {
          comment.downvotes.pull(userId);
        }
      }
    } else if (type === 'downvote') {
      if (alreadyDownvoted) {
        comment.downvotes.pull(userId);
      } else {
        comment.downvotes.push(userId);
        if (alreadyUpvoted) {
          comment.upvotes.pull(userId);
        }
      }
    }

    await missingPerson.save();
    
    res.json({
      success: true,
      message: `Comment ${type}d successfully`,
      upvotes: comment.upvotes.length,
      downvotes: comment.downvotes.length,
      userVote: alreadyUpvoted && type === 'upvote' ? null : 
                alreadyDownvoted && type === 'downvote' ? null : type
    });
  } catch (error) {
    console.error("Vote Comment Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Vote on reply (upvote/downvote)
exports.voteReply = async (req, res) => {
  try {
    const { id, commentId, replyId } = req.params;
    const { type } = req.body; // 'upvote' or 'downvote'
    const userId = req.user.id;

    if (!['upvote', 'downvote'].includes(type)) {
      return res.status(400).json({ message: "Invalid vote type" });
    }

    const missingPerson = await MissingPerson.findById(id);
    if (!missingPerson) {
      return res.status(404).json({ message: "Missing person not found" });
    }

    const comment = missingPerson.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const reply = comment.replies.id(replyId);
    if (!reply) {
      return res.status(404).json({ message: "Reply not found" });
    }
    reply.upvotes ??= [];
reply.downvotes ??= [];

reply.markModified('upvotes');
reply.markModified('downvotes');
    const alreadyUpvoted = reply.upvotes.includes(userId);
    const alreadyDownvoted = reply.downvotes.includes(userId);

    if (type === 'upvote') {
      if (alreadyUpvoted) {
        reply.upvotes.pull(userId);
      } else {
        reply.upvotes.push(userId);
        if (alreadyDownvoted) {
          reply.downvotes.pull(userId);
        }
      }
    } else if (type === 'downvote') {
      if (alreadyDownvoted) {
        reply.downvotes.pull(userId);
      } else {
        reply.downvotes.push(userId);
        if (alreadyUpvoted) {
          reply.upvotes.pull(userId);
        }
      }
    }

    await missingPerson.save();
    
    res.json({
      success: true,
      message: `Reply ${type}d successfully`,
      upvotes: reply.upvotes.length,
      downvotes: reply.downvotes.length,
      userVote: alreadyUpvoted && type === 'upvote' ? null : 
                alreadyDownvoted && type === 'downvote' ? null : type
    });
  } catch (error) {
    console.error("Vote Reply Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete comment (only by comment owner)
exports.deleteComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;

    // Normalize userId to string
    const userId = req.user?._id?.toString() || req.user?.id?.toString();

    const missingPerson = await MissingPerson.findById(id);
    if (!missingPerson) {
      return res.status(404).json({ message: "Missing person not found" });
    }

    const comment = missingPerson.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Normalize comment.user to string
    const commentUserId = comment.user?._id?.toString() || comment.user?.toString();

    if (commentUserId !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    comment.deleteOne();
    await missingPerson.save();

    res.json({ 
      success: true,
      message: "Comment deleted successfully" 
    });
  } catch (error) {
    console.error("Delete Comment Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete reply (only by reply owner)
exports.deleteReply = async (req, res) => {
  try {
    const { id, commentId, replyId } = req.params;

    // Normalize userId to string
    const userId = req.user?._id?.toString() || req.user?.id?.toString();

    const missingPerson = await MissingPerson.findById(id);
    if (!missingPerson) {
      return res.status(404).json({ message: "Missing person not found" });
    }

    const comment = missingPerson.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const reply = comment.replies.id(replyId);
    if (!reply) {
      return res.status(404).json({ message: "Reply not found" });
    }

    // Normalize reply.user to string
    const replyUserId = reply.user?._id?.toString() || reply.user?.toString();

    if (replyUserId !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    reply.deleteOne();
    await missingPerson.save();

    res.json({ 
      success: true,
      message: "Reply deleted successfully" 
    });
  } catch (error) {
    console.error("Delete Reply Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ==================== UPVOTE/DOWNVOTE MISSING PERSON ====================

exports.upvoteMissingPerson = async (req, res) => {
  try {
    const missingPerson = await MissingPerson.findById(req.params.id);

    if (!missingPerson) {
      return res.status(404).json({
        success: false,
        message: 'Missing person not found'
      });
    }

    const userId = req.user.id;

    const alreadyUpvoted = missingPerson.upvotes.some(
      upvote => upvote.toString() === userId.toString()
    );

    if (alreadyUpvoted) {
      missingPerson.upvotes = missingPerson.upvotes.filter(
        upvote => upvote.toString() !== userId.toString()
      );
    } else {
      missingPerson.upvotes.push(userId);
      missingPerson.downvotes = missingPerson.downvotes.filter(
        downvote => downvote.toString() !== userId.toString()
      );
    }

    await missingPerson.save();

    res.status(200).json({
      success: true,
      message: alreadyUpvoted ? 'Upvote removed' : 'Upvoted successfully',
      upvotes: missingPerson.upvotes.length,
      downvotes: missingPerson.downvotes.length
    });
  } catch (error) {
    console.error('Upvote error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.downvoteMissingPerson = async (req, res) => {
  try {
    const missingPerson = await MissingPerson.findById(req.params.id);

    if (!missingPerson) {
      return res.status(404).json({
        success: false,
        message: 'Missing person not found'
      });
    }

    const userId = req.user.id;

    const alreadyDownvoted = missingPerson.downvotes.some(
      downvote => downvote.toString() === userId.toString()
    );

    if (alreadyDownvoted) {
      missingPerson.downvotes = missingPerson.downvotes.filter(
        downvote => downvote.toString() !== userId.toString()
      );
    } else {
      missingPerson.downvotes.push(userId);
      missingPerson.upvotes = missingPerson.upvotes.filter(
        upvote => upvote.toString() !== userId.toString()
      );
    }

    await missingPerson.save();

    res.status(200).json({
      success: true,
      message: alreadyDownvoted ? 'Downvote removed' : 'Downvoted successfully',
      upvotes: missingPerson.upvotes.length,
      downvotes: missingPerson.downvotes.length
    });
  } catch (error) {
    console.error('Downvote error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
