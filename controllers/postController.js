const Post = require("../models/Post");
const cloudinary = require("../utils/cloudinary");
const User = require("../models/User");
const streamifier = require("streamifier");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const haversine = require("haversine-distance");
const OpenAI = require("openai");
const axios = require("axios");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });




//Helper Functions
const uploadToCloudinary = (fileBuffer, folder = "posts") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { 
        folder,
        timeout: 30000 // 30 second timeout for Cloudinary
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return reject(error);
        }
        resolve(result);
      }
    );

    // Handle stream errors
    uploadStream.on('error', (error) => {
      console.error('Upload stream error:', error);
      reject(error);
    });

    const readStream = streamifier.createReadStream(fileBuffer);
    
    // Handle read stream errors
    readStream.on('error', (error) => {
      console.error('Read stream error:', error);
      reject(error);
    });

    readStream.pipe(uploadStream);
  });
};

// Convert Cloudinary URL → Base64 url
async function urlToBase64(url) {
  try {
    const response = await axios.get(url, { 
      responseType: "arraybuffer",
      timeout: 10000 // optional: prevent hanging
    });

    // Detect MIME type from response headers (fallback to jpeg)
    const contentType = response.headers['content-type'] || 'image/jpeg';

    // Convert buffer to base64
    const base64 = Buffer.from(response.data, 'binary').toString('base64');

    // Return full data URL → this is what OpenAI expects!
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error("Error converting image to base64:", err.message || err);
    return null;
  }
}
// User approves or eidts sumary -> trigger heavy AI Job
// /posts/:postId/approve-summary


// 🔹 Create a post with proper error handling
const createPost = async (req, res) => {
  // Set longer timeout for file processing
  req.setTimeout(60000); // 60 seconds
  
  try {
    const {
      incidentDescription,
      crimeType,
      date,
      time,
      locationText,
      lat,
      lng,
      anonymous,
      agreed,
    } = req.body;

    // Validate required fields
    if (!crimeType || !date || !time || !locationText) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    let uploadedImages = [];
    
    // Upload images if present with better error handling
    if (req.files?.length > 0) {
      console.log(`Processing ${req.files.length} images...`);
      
      try {
        // Process images sequentially to avoid overwhelming the server
        for (const [index, file] of req.files.entries()) {
          console.log(`Uploading image ${index + 1}/${req.files.length}: ${file.originalname}`);
          
          // Additional client-side validation (defensive)
          if (file.size > 5 * 1024 * 1024) {
            throw new Error(`File ${file.originalname} exceeds 5MB limit`);
          }

          const result = await uploadToCloudinary(file.buffer, "posts");
          uploadedImages.push(result.secure_url);
          console.log(`Successfully uploaded image ${index + 1}/${req.files.length}`);
        }
      } catch (uploadError) {
        console.error('Image upload failed:', uploadError);
        
        // Cleanup: Delete any successfully uploaded images from Cloudinary
        if (uploadedImages.length > 0) {
          console.log('Cleaning up uploaded images due to error...');
          for (const imageUrl of uploadedImages) {
            try {
              const publicId = imageUrl.split('/').pop().split('.')[0];
              await cloudinary.uploader.destroy(`posts/${publicId}`);
            } catch (cleanupError) {
              console.error('Error during cleanup:', cleanupError);
            }
          }
        }
        
        throw uploadError; // Re-throw to be caught by outer catch
      }
    }

    // Save the post first
    const post = await Post.create({
      user: req.user.id,
      incidentDescription,
      crimeType,
      date,
      time,
      locationText,
      coordinates: { lat, lng },
      anonymous: anonymous === "true",
      agreed: agreed === "true",
      images: uploadedImages,
      description: incidentDescription,
       aiReport: {
        status: "processing_summary",
        shortSummary: null,
        fullReport: null,
        extractedData: null,
      },
    });

    console.log('Post created successfully with ID:', post._id);
    
    // Clean up temporary files if using disk storage
    if (req.files?.length > 0) {
      req.files.forEach(file => {
        if (file.path) {
          fs.unlink(file.path, (err) => {
            if (err) console.error('Error deleting temp file:', err);
          });
        }
      });
    }
     // ---------- Generate Short Summary via OpenAI ----------
    let aiSummary = null;
    try {
      const response = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an AI crime summarizer. Create a short readable summary for a public crime report. Keep it neutral and under 3 sentences.",
          },
          {
            role: "user",
            content: `
Crime Type: ${crimeType}
Incident Details: ${incidentDescription || "No details provided."}
Location: ${locationText}
Date: ${date} at ${time}

Image URLs: ${uploadedImages.join("\n")}
`,
          },
        ],
      });

      aiSummary = response.choices[0].message.content.trim();
    } catch (aiError) {
      console.error("AI summary error → fallback to description");
      aiSummary = incidentDescription;
    }

    // ---------- Update Post with Summary ----------
    post.aiReport.shortSummary = aiSummary;
    post.aiReport.status = "awaiting_user_approval";
    await post.save();

    await User.findByIdAndUpdate(req.user.id, { $inc: { postsCount: 1 } });

    return res.status(201).json({
      message: "Post created. AI summary ready for approval.",
      post,
      aiSummary,
      requiresApproval: true,
    });
  } catch (error) {
    console.error("Create Post Error:", error);

    return res.status(500).json({
      message: "Server error while creating post",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};


//new one 
const finalizeReport = async (req, res) => {
  const { postId } = req.params;
  const { description } = req.body;

  try {
    const post = await Post.findById(postId);
    if (!post)
      return res.status(404).json({ message: "Post not found" });

    // If user edited the short summary
    if (description) {
      post.aiReport.shortSummary = description;
      post.description = description; // <-- updated here
    }

    post.aiReport.status = "processing_full_report";
    await post.save();

    // ----------------------------------------------------------
    // STEP 1 — Convert Cloudinary Images → Base64
    // ----------------------------------------------------------
    const imageInputs = [];
    for (const url of post.images) {
      const dataUrl = await urlToBase64(url);
      if (dataUrl) {
        imageInputs.push({
          type: "image_url",
          image_url: { url: dataUrl},
        });
      }
    }

    // ----------------------------------------------------------
    // STEP 2 — Build prompt for AI (image + text)
    // ----------------------------------------------------------
    const messages = [
      {
        role: "system",
        content: `
You are an advanced Law Enforcement AI specializing in crime scene forensics.
Analyze ALL images + text and return TWO outputs:

1) A SINGLE long narrative paragraph describing the full forensic incident report.  
   - No headings  
   - No markdown  
   - No bullet points  
   - No labels  
   - No bold text  
   - No section titles  
   - No "incident overview", "scene analysis", "victim" etc  
   - No "JSON summary" mention  
   - Just ONE clean paragraph of narrative text.

2) After the narrative paragraph, return a STRICT JSON object ONLY with this exact shape:

{
  "weapons": ["AK47", "Glock", "Knife"],
  "vehicleTypes": ["Toyota Corolla", "Motorcycle"],
  "licensePlates": ["ABC-123", "LZE 9083"],
  "suspectsCount": 2,
  "facesDetected": 3,
  "ocrText": "detected text from signs/plates/etc",
  "confidenceScore": 0.87
}

RULES:
- If unsure, return approximate values (e.g. "2 pistols", "1 car").
- Do NOT add extra fields.
- Do NOT invent details without visual or textual evidence.
- JSON must be raw and parseable.
- Never wrap JSON in markdown.
        `,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `
Short Summary: ${post.aiReport.shortSummary}
Incident Description: ${post.incidentDescription}
Crime Type: ${post.crimeType}
Location: ${post.locationText}
Date: ${post.date}
Time: ${post.time}
Coordinates: ${post.coordinates?.lat}, ${post.coordinates?.lng}
            `
          },
          ...imageInputs,
        ],
      },
    ];

    // ----------------------------------------------------------
    // STEP 3 — Generate full report using OpenAI Vision
    // ----------------------------------------------------------
    let fullTextOutput = "";
    try {
      const aiRes = await client.chat.completions.create({
        model: "gpt-4.1",
        messages,
        temperature: 0.2,
        max_tokens: 4096
      });

      fullTextOutput = aiRes.choices[0].message.content;
    } catch (err) {
      console.error("AI Failed:", err);
      fullTextOutput = "AI could not generate full report.";
    }

    // ----------------------------------------------------------
    // STEP 4 — Extract JSON + Narrative
    // ----------------------------------------------------------
    let extractedJSON = null;
    let narrativeReport = fullTextOutput;

    // Try to extract JSON safely
    const jsonMatch = fullTextOutput.match(/\{[\s\S]*\}$/);
    if (jsonMatch) {
      try {
        extractedJSON = JSON.parse(jsonMatch[0]);
        narrativeReport = fullTextOutput.replace(jsonMatch[0], "").trim();
      } catch (err) {
        console.error("JSON parse failed:", err);
      }
    }

    // ----------------------------------------------------------
    // STEP 5 — Save to MongoDB in correct schema fields
    // ----------------------------------------------------------
    if (extractedJSON) {
      post.aiReport.extracted.weapons =
        extractedJSON.weapons || [];

      post.aiReport.extracted.vehicleTypes =
        extractedJSON.vehicleTypes || [];

      post.aiReport.extracted.licensePlates =
        extractedJSON.licensePlates || [];

      post.aiReport.extracted.suspectsCount =
        extractedJSON.suspectsCount ?? null;

      post.aiReport.extracted.facesDetected =
        extractedJSON.facesDetected ?? null;

      post.aiReport.extracted.ocrText =
        extractedJSON.ocrText || "";

      post.aiReport.confidenceScore =
        extractedJSON.confidenceScore ?? 0;
    }

    post.aiReport.fullReport = narrativeReport;
    post.aiReport.status = "completed";

    await post.save();

    return res.status(200).json({
      message: "Full AI report generated successfully",
      fullReport: narrativeReport,
      extracted: extractedJSON,
      post,
    });
  } catch (err) {
    console.error("Finalize Report Error:", err);
    return res
      .status(500)
      .json({ message: "Server error while finalizing report" });
  }
};



//     res.status(201).json({
//       message: "Post created successfully",
//       post: post
//     });
    
//   } catch (error) {
//     console.error("Create Post Error:", error);
    
//     // Specific error handling
//     if (error.code === 'ECONNRESET') {
//       console.log('Client disconnected during upload');
//       return res.status(499).json({ message: "Upload was cancelled" });
//     }
    
//     if (error.message.includes('File too large') || error.message.includes('exceeds 5MB limit')) {
//       return res.status(400).json({ message: "File too large. Maximum 5MB per file." });
//     }
    
//     if (error.message.includes('timeout')) {
//       return res.status(408).json({ message: "Upload timeout. Please try again with smaller files." });
//     }
    
//     if (error.message.includes('Only image files')) {
//       return res.status(400).json({ message: "Invalid file type. Only images are allowed." });
//     }
    
//     res.status(500).json({ 
//       message: "Server error while creating post",
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

// 🔹 Get posts by a specific user
// const getUserPosts = async (req, res) => {
//   try {
//     const { username } = req.params;
//     const currentUserId = req.user?.id; 

//     // Find the user by username first
//     const user = await User.findOne({ username });
//     if (!user) return res.status(404).json({ message: "User not found" });

//      // Then find posts by that user's _id
//     const posts = await Post.find({ user: user._id })
//       .populate("user", "name username profilePicture verified")
//       .populate("comments.user", "name username profilePicture verified")
//       .sort({ createdAt: -1 });

//        // Add ownership and voting status information
//     const postsWithOwnership = posts.map(post => {
//       const postObj = post.toObject();
      
//       // Check if current user owns the post
//       postObj.isOwner = currentUserId && post.user._id.toString() === currentUserId.toString();
      
//       // Check if current user has voted
//       if (currentUserId) {
//         postObj.userVote = post.upvotes.includes(currentUserId) ? 'upvote' : 
//                           post.downvotes.includes(currentUserId) ? 'downvote' : null;
//       } else {
//         postObj.userVote = null;
//       }
      
//       return postObj;
//     });

//     res.json(postsWithOwnership);
//   } catch (error) {
//     console.error("Get User Posts Error:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

//     res.json(posts);
//   } catch (error) {
//     console.error("Get User Posts Error:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };


// 🔹 Add voting functionality
const upvotePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const alreadyUpvoted = post.upvotes.some(id => id.equals(userId));
    const alreadyDownvoted = post.downvotes.some(id => id.equals(userId));

    if (alreadyUpvoted) {
      post.upvotes.pull(userId);
    } else {
      post.upvotes.push(userId);
      if (alreadyDownvoted) post.downvotes.pull(userId);
    }

    await post.save();

    // Recompute userVote after saving
    const userVote = post.upvotes.some(id => id.equals(userId))
      ? "upvote"
      : post.downvotes.some(id => id.equals(userId))
      ? "downvote"
      : null;

    res.json({
      message: alreadyUpvoted ? "Upvote removed" : "Post upvoted",
      upvotes: post.upvotes.length,
      downvotes: post.downvotes.length,
      userVote
    });
  } catch (error) {
    console.error("Upvote Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const downvotePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const alreadyDownvoted = post.downvotes.some(id => id.equals(userId));
    const alreadyUpvoted = post.upvotes.some(id => id.equals(userId));

    if (alreadyDownvoted) {
      post.downvotes.pull(userId);
    } else {
      post.downvotes.push(userId);
      if (alreadyUpvoted) post.upvotes.pull(userId);
    }

    await post.save();

    const userVote = post.upvotes.some(id => id.equals(userId))
      ? "upvote"
      : post.downvotes.some(id => id.equals(userId))
      ? "downvote"
      : null;

    res.json({
      message: alreadyDownvoted ? "Downvote removed" : "Post downvoted",
      upvotes: post.upvotes.length,
      downvotes: post.downvotes.length,
      userVote
    });
  } catch (error) {
    console.error("Downvote Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};



///////


// 🔹 Get all posts (feed) ////////later add algorithm of posts
// 🔹 Update getPostById to include ownership info
// const getPostById = async (req, res) => {
//   try {
//     const currentUserId = req.user?.id;
//     const post = await Post.findById(req.params.postId)
//       .populate("user", "name username profilePicture verified")
//       .populate("comments.user", "name username profilePicture verified");

//     if (!post) return res.status(404).json({ message: "Post not found" });

//     const postObj = post.toObject();
//     postObj.isOwner = currentUserId && post.user._id.toString() === currentUserId.toString();
    
//     if (currentUserId) {
//       postObj.userVote = post.upvotes.includes(currentUserId) ? 'upvote' : 
//                         post.downvotes.includes(currentUserId) ? 'downvote' : null;
//     }

//     res.json(postObj);
//   } catch (error) {
//     console.error("Get Post Error:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// }; change bcs of reply issue 

const getPostById = async (req, res) => {
  try {
    const currentUserId = req.user?.id;
    const post = await Post.findById(req.params.postId)
      .populate("user", "name username profilePicture verified")
      .populate("comments.user", "name username profilePicture verified")
      .populate("comments.replies.user", "name username profilePicture verified"); // Add this line

    if (!post) return res.status(404).json({ message: "Post not found" });

    const postObj = post.toObject();
    postObj.isOwner = currentUserId && post.user._id.toString() === currentUserId.toString();
    
    if (currentUserId) {
      postObj.userVote = post.upvotes.includes(currentUserId) ? 'upvote' : 
                        post.downvotes.includes(currentUserId) ? 'downvote' : null;

      // Process comments and replies with userVote and isOwner (similar to getUserPosts)
      postObj.comments = postObj.comments.map(comment => {
        const commentUserId = comment.user?._id?.toString();
        return {
          ...comment,
          user: {
            _id: commentUserId,
            name: comment.user?.name,
            username: comment.user?.username,
            profilePicture: comment.user?.profilePicture,
            verified: comment.user?.verified,
          },
          userVote: comment.upvotes.includes(currentUserId)
            ? "upvote"
            : comment.downvotes.includes(currentUserId)
            ? "downvote"
            : null,
          isOwner: commentUserId === currentUserId,
          replies: comment.replies.map(reply => {
            const replyUserId = reply.user?._id?.toString();
            return {
              ...reply,
              user: {
                _id: replyUserId,
                name: reply.user?.name,
                username: reply.user?.username,
                profilePicture: reply.user?.profilePicture,
                verified: reply.user?.verified,
              },
              userVote: reply.upvotes.includes(currentUserId)
                ? "upvote"
                : reply.downvotes.includes(currentUserId)
                ? "downvote"
                : null,
              isOwner: replyUserId === currentUserId,
            };
          }),
        };
      });
    }

    res.json(postObj);
  } catch (error) {
    console.error("Get Post Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔹 Update getAllPosts to include ownership info
const getAllPosts = async (req, res) => {
  try {
    const currentUserId = req.user?.id;

    const posts = await Post.find()
      .populate("user", "name username profilePicture verified")
      .populate("comments.user", "name username profilePicture verified")
      .sort({ createdAt: -1 });

    const postsWithOwnership = posts.map(post => {
      const postObj = post.toObject();
      postObj.isOwner = currentUserId && post.user._id.toString() === currentUserId.toString();
      
      if (currentUserId) {
        postObj.userVote = post.upvotes.includes(currentUserId) ? 'upvote' : 
                          post.downvotes.includes(currentUserId) ? 'downvote' : null;
      }
      
      return postObj;
    });

    res.json(postsWithOwnership);
  } catch (error) {
    console.error("Get All Posts Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔹 Update post summary only
const updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { description } = req.body;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // if (post.user.toString() !== req.user.id) {
    //   return res.status(403).json({ message: "Unauthorized" });
    // }

    post.description = description;
    await post.save();

    res.json(post);
  } catch (error) {
    console.error("Update Post Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔹 Delete a post (with Cloudinary images cleanup)
const deletePost = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // if (post.user.toString() !== req.user.id) {
    //   return res.status(403).json({ message: "Unauthorized" });
    // }

    // delete images from cloudinary
    for (const imgUrl of post.images) {
      const publicId = imgUrl.split("/").pop().split(".")[0]; 
      await cloudinary.uploader.destroy(`posts/${publicId}`);
    }

    await post.deleteOne();
    await User.findByIdAndUpdate(post.user, { $inc: { postsCount: -1 } });

    res.json({ message: "Post deleted successfully" });
  } catch (error) {
    console.error("Delete Post Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔹 Add comment to post
const addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const newComment = {
      user: req.user.id,
      text: text.trim(),
      upvotes: [],
      downvotes: [],
      replies: []
    };

    post.comments.push(newComment);
    await post.save();

    // Populate the new comment with user data
    await post.populate('comments.user', 'name username profilePicture verified');
    
    const addedComment = post.comments[post.comments.length - 1];
    res.status(201).json({
      message: "Comment added successfully",
      comment: addedComment
    });
  } catch (error) {
    console.error("Add Comment Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔹 Add reply to comment
const addReply = async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ message: "Reply text is required" });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const newReply = {
      user: req.user.id,
      text: text.trim(),
      upvotes: [],
      downvotes: []
    };

    comment.replies.push(newReply);
    await post.save();

    // Populate the reply with user data
    await post.populate('comments.replies.user', 'name username profilePicture verified');
    
    const addedReply = comment.replies[comment.replies.length - 1];
    res.status(201).json({
      message: "Reply added successfully",
      reply: addedReply
    });
  } catch (error) {
    console.error("Add Reply Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔹 Upvote/Downvote comment
const voteComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { type } = req.body; // 'upvote' or 'downvote'
    const userId = req.user.id;

    if (!['upvote', 'downvote'].includes(type)) {
      return res.status(400).json({ message: "Invalid vote type" });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

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

    await post.save();
    res.json({
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

// 🔹 Upvote/Downvote reply
const voteReply = async (req, res) => {
  try {
    const { postId, commentId, replyId } = req.params;
    const { type } = req.body; // 'upvote' or 'downvote'
    const userId = req.user.id;

    if (!['upvote', 'downvote'].includes(type)) {
      return res.status(400).json({ message: "Invalid vote type" });
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const reply = comment.replies.id(replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

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

    await post.save();
    res.json({
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

// 🔹 Delete comment (only by comment owner or post owner)
const deleteComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;

    // ✅ Always normalize userId to string
    const userId = req.user?._id?.toString() || req.user?.id?.toString();

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // ✅ Normalize comment.user to string
    const commentUserId =
      comment.user?._id?.toString() || comment.user?.toString();

    console.log("Delete Comment Debug:");
    console.log("Current userId:", userId);
    console.log("Comment ownerId:", commentUserId);

    if (commentUserId !== userId) {
      console.log("❌ Unauthorized: IDs don't match");
      return res.status(403).json({ message: "Unauthorized" });
    }

    // ✅ Delete and save
    comment.deleteOne();
    await post.save();

    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Delete Comment Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


const deleteReply = async (req, res) => {
  try {
    const { postId, commentId, replyId } = req.params;

    // ✅ Always normalize userId to string
    const userId = req.user?._id?.toString() || req.user?.id?.toString();

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const reply = comment.replies.id(replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    // ✅ Normalize reply.user to string
    const replyUserId =
      reply.user?._id?.toString() || reply.user?.toString();

    console.log("Delete Reply Debug:");
    console.log("Current userId:", userId);
    console.log("Reply ownerId:", replyUserId);

    if (replyUserId !== userId) {
      console.log("❌ Unauthorized: IDs don't match");
      return res.status(403).json({ message: "Unauthorized" });
    }

    reply.deleteOne();
    await post.save();

    res.json({ message: "Reply deleted successfully" });
  } catch (error) {
    console.error("Delete Reply Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};



// Update your existing functions to properly populate comments
// const getUserPosts = async (req, res) => {
//   try {
//     const { username } = req.params;
//     const currentUserId = req.user?.id; 

//     const user = await User.findOne({ username });
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const posts = await Post.find({ user: user._id })
//       .populate("user", "name username profilePicture verified")
//       .populate("comments.user", "name username profilePicture verified")
//       .populate("comments.replies.user", "name username profilePicture verified")
//       .sort({ createdAt: -1 });

//     const postsWithOwnership = posts.map(post => {
//       const postObj = post.toObject();
//       postObj.isOwner = currentUserId && post.user._id.toString() === currentUserId.toString();
      
//       if (currentUserId) {
//         postObj.userVote = post.upvotes.includes(currentUserId) ? 'upvote' : 
//                           post.downvotes.includes(currentUserId) ? 'downvote' : null;
        
//         // Add user vote status for comments and replies
//         postObj.comments.forEach(comment => {
//           comment.userVote = comment.upvotes.includes(currentUserId) ? 'upvote' : 
//                            comment.downvotes.includes(currentUserId) ? 'downvote' : null;
          
//           comment.replies.forEach(reply => {
//             reply.userVote = reply.upvotes.includes(currentUserId) ? 'upvote' : 
//                            reply.downvotes.includes(currentUserId) ? 'downvote' : null;
//           });
//         });
//       }
      
//       return postObj;
//     });

//     res.json(postsWithOwnership);
//   } catch (error) {
//     console.error("Get User Posts Error:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };
const getUserPosts = async (req, res) => {
  try {
    const { username } = req.params;
    const currentUserId = req.user?.id; 

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ message: "User not found" });

    const posts = await Post.find({ user: user._id })
      .populate("user", "name username profilePicture verified")
      .populate("comments.user", "name username profilePicture verified")
      .populate("comments.replies.user", "name username profilePicture verified")
      .sort({ createdAt: -1 });

    const postsWithOwnership = posts.map(post => {
      const postObj = post.toObject();

      // ✅ Check if current user is the post owner
      postObj.isOwner =
        currentUserId &&
        post.user._id.toString() === currentUserId.toString();

      // if (currentUserId) {
      //   // ✅ Mark vote status on post
      //   postObj.userVote = post.upvotes.includes(currentUserId)
      //     ? "upvote"
      //     : post.downvotes.includes(currentUserId)
      //     ? "downvote"
      //     : null;

      //   // ✅ Process comments
      //   postObj.comments = postObj.comments.map(comment => {
      //     const commentUserId = comment.user?._id?.toString();
      //     return {
      //       ...comment,
      //       user: {
      //         _id: commentUserId,
      //         name: comment.user?.name,
      //         username: comment.user?.username,
      //         profilePicture: comment.user?.profilePicture,
      //         verified: comment.user?.verified,
      //       },
      //       userVote: comment.upvotes.includes(currentUserId)
      //         ? "upvote"
      //         : comment.downvotes.includes(currentUserId)
      //         ? "downvote"
      //         : null,
      //       isOwner: commentUserId === currentUserId, // ✅ mark comment ownership
      //       replies: comment.replies.map(reply => {
      //         const replyUserId = reply.user?._id?.toString();
      //         return {
      //           ...reply,
      //           user: {
      //             _id: replyUserId,
      //             name: reply.user?.name,
      //             username: reply.user?.username,
      //             profilePicture: reply.user?.profilePicture,
      //             verified: reply.user?.verified,
      //           },
      //           userVote: reply.upvotes.includes(currentUserId)
      //             ? "upvote"
      //             : reply.downvotes.includes(currentUserId)
      //             ? "downvote"
      //             : null,
      //           isOwner: replyUserId === currentUserId, // ✅ mark reply ownership
      //         };
      //       }),
      //     };
      //   });
      // }
      if (currentUserId) {
  // ✅ Mark vote status on post
  const currentUserIdStr = currentUserId.toString();

  postObj.userVote = post.upvotes.map(id => id.toString()).includes(currentUserIdStr)
    ? "upvote"
    : post.downvotes.map(id => id.toString()).includes(currentUserIdStr)
    ? "downvote"
    : null;

  // ✅ Process comments similarly
  postObj.comments = postObj.comments.map(comment => {
    const commentUserId = comment.user?._id?.toString();
    return {
      ...comment,
      userVote: comment.upvotes.map(id => id.toString()).includes(currentUserIdStr)
        ? "upvote"
        : comment.downvotes.map(id => id.toString()).includes(currentUserIdStr)
        ? "downvote"
        : null,
      isOwner: commentUserId === currentUserIdStr,
      replies: comment.replies.map(reply => {
        const replyUserId = reply.user?._id?.toString();
        return {
          ...reply,
          userVote: reply.upvotes.map(id => id.toString()).includes(currentUserIdStr)
            ? "upvote"
            : reply.downvotes.map(id => id.toString()).includes(currentUserIdStr)
            ? "downvote"
            : null,
          isOwner: replyUserId === currentUserIdStr,
        };
      }),
    };
  });
}

      return postObj;
    });

    res.json(postsWithOwnership);
  } catch (error) {
    console.error("Get User Posts Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};



// Personalized feed
// const getPersonalizedFeed = async (req, res) => {
//   try {
//     const userId = req.user.id;

//     // 1. Fetch current user
//     const currentUser = await User.findById(userId).select("following location");

//     if (!currentUser) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     // 2. Get posts (you can limit for performance, e.g., latest 200)
//     const posts = await Post.find()
//       .populate("user", "username name profilePicture location")
//       .sort({ createdAt: -1 }) // newest first before scoring
//       .limit(200);

//     // 3. Score each post
//     const scoredPosts = posts.map((post) => {
//       let score = 0;

//       // 🟢 Factor 1: Following
//       if (currentUser.following.some((id) => id.equals(post.user._id))) {
//         score += 3;
//       }

//       // 🟢 Factor 2: Location
//       if (
//         currentUser.location &&
//         post.user.location &&
//         currentUser.location.toLowerCase() === post.user.location.toLowerCase()
//       ) {
//         score += 2;
//       }

//       // 🟢 Factor 3: Recency
//       const hoursSincePosted =
//         (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
//       if (hoursSincePosted < 24) {
//         score += 2; // < 24h old
//       } else if (hoursSincePosted < 72) {
//         score += 1; // < 3 days old
//       }

//       // 🟢 Factor 4: Engagement
//       const engagement =
//         (post.likes?.length || 0) +
//         (post.upvotes?.length || 0) -
//         (post.downvotes?.length || 0) +
//         (post.comments?.length || 0);
//       if (engagement > 20) score += 2;
//       else if (engagement > 5) score += 1;

//       return { post, score };
//     });

//     // 4. Sort posts by score (highest first)
//     scoredPosts.sort((a, b) => b.score - a.score);

//     // 5. Extract only posts (with score optionally)
//     const feed = scoredPosts.map((item) => ({
//       ...item.post.toObject(),
//       relevanceScore: item.score, // optional, for debugging
//     }));

//     res.json({ feed });
//   } catch (error) {
//     console.error("Feed Error:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };
// controllers/feedController.js


const getPersonalizedFeed = async (req, res) => {
  try {
    const userId = req.user.id;
    const { cursor, limit = 10 } = req.query;

    // 1️⃣ Get current user
    const currentUser = await User.findById(userId).select("following location coordinates");
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2️⃣ Base query
    const query = {};
    if (cursor) query.createdAt = { $lt: new Date(cursor) };

    // 3️⃣ Fetch posts
    const posts = await Post.find(query)
      .populate("user", "username name profilePicture location coordinates verified")
      .populate("comments.user", "name username profilePicture verified")
      .populate("comments.replies.user", "name username profilePicture verified")
      .sort({ createdAt: -1 })
      .limit(Number(limit) + 1);

    // 4️⃣ Scoring logic
    const scoredPosts = posts.map((post) => {
      let score = 0;

      // --- Following factor ---
      if (currentUser.following.some((id) => id.equals(post.user._id))) score += 3;

      // --- Location text match (e.g. same city) ---
      if (
        currentUser.location &&
        post.user.location &&
        currentUser.location.toLowerCase() === post.user.location.toLowerCase()
      ) {
        score += 2;
      }

      // --- Coordinate-based distance scoring ---
      if (currentUser.coordinates && post.user.coordinates) {
        const userCoords = {
          lat: currentUser.coordinates.lat,
          lon: currentUser.coordinates.lng,
        };
        const postCoords = {
          lat: post.user.coordinates.lat,
          lon: post.user.coordinates.lng,
        };

        const distanceKm = haversine(userCoords, postCoords) / 1000; // convert meters → km

        // The closer, the higher the score
        if (distanceKm < 5) score += 3;
        else if (distanceKm < 20) score += 2;
        else if (distanceKm < 50) score += 1;
      }

      // --- Recency factor ---
      const hoursSince = (Date.now() - new Date(post.createdAt)) / (1000 * 60 * 60);
      if (hoursSince < 24) score += 2;
      else if (hoursSince < 72) score += 1;

      // --- Engagement factor ---
      const engagement =
        (post.likes?.length || 0) +
        (post.upvotes?.length || 0) -
        (post.downvotes?.length || 0) +
        (post.comments?.length || 0);

      if (engagement > 20) score += 2;
      else if (engagement > 5) score += 1;

      return { post, score };
    });

    // 5️⃣ Sort by score (descending)
    scoredPosts.sort((a, b) => b.score - a.score);

    // 6️⃣ Format posts for frontend
    const feed = scoredPosts.slice(0, limit).map(({ post, score }) => {
      const postObj = post.toObject();
      const currentUserIdStr = userId.toString();

      // --- Post vote ---
      postObj.userVote = post.upvotes.some((id) => id.equals(userId))
        ? "upvote"
        : post.downvotes.some((id) => id.equals(userId))
        ? "downvote"
        : null;

      // --- Process comments ---
      postObj.comments = postObj.comments.map((comment) => {
        const commentUserId = comment.user?._id?.toString();
        return {
          ...comment,
          userVote: comment.upvotes.includes(userId)
            ? "upvote"
            : comment.downvotes.includes(userId)
            ? "downvote"
            : null,
          isOwner: commentUserId === currentUserIdStr,
          replies: comment.replies.map((reply) => {
            const replyUserId = reply.user?._id?.toString();
            return {
              ...reply,
              userVote: reply.upvotes.includes(userId)
                ? "upvote"
                : reply.downvotes.includes(userId)
                ? "downvote"
                : null,
              isOwner: replyUserId === currentUserIdStr,
            };
          }),
        };
      });

      postObj.relevanceScore = score;
      return postObj;
    });

    // 7️⃣ Pagination
    const nextCursor = posts.length > limit ? posts[limit - 1].createdAt : null;

    res.json({
      feed,
      nextCursor,
      hasMore: !!nextCursor,
    });
  } catch (error) {
    console.error("Feed Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};







module.exports = {
  createPost,
  getAllPosts,
  getPostById,
  getUserPosts,
  finalizeReport,
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
};

