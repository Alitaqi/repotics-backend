const Post = require("../models/Post");
const cloudinary = require("../utils/cloudinary");
const User = require("../models/User");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const MissingPerson = require("../models/MissingPerson");
const Notification = require("../models/Notifications");

const getCrimeByTimeOfDay = async (req, res) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const timeSlots = [
      { label: "12am-4am", start: 0, end: 3 },
      { label: "4am-8am", start: 4, end: 7 },
      { label: "8am-12pm", start: 8, end: 11 },
      { label: "12pm-4pm", start: 12, end: 15 },
      { label: "4pm-8pm", start: 16, end: 19 },
      { label: "8pm-12am", start: 20, end: 23 },
    ];

    const monthNames = ["January","February","March","April","May",
                        "June","July","August","September","October","November","December"];

    // Get last 6 months list
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    const data = await Post.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            hour: { $hour: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Build lookup: "2024-9-14" -> count
    const lookup = {};
    data.forEach(({ _id, count }) => {
      const key = `${_id.year}-${_id.month}-${_id.hour}`;
      lookup[key] = count;
    });

    // For each time slot, build { timeSlot, Jan: 4, Feb: 2, ... }
    const formatted = timeSlots.map(({ label, start, end }) => {
      const row = { timeSlot: label };
      months.forEach(({ year, month }) => {
        const monthLabel = monthNames[month - 1].slice(0, 3);
        let total = 0;
        for (let h = start; h <= end; h++) {
          total += lookup[`${year}-${month}-${h}`] || 0;
        }
        row[monthLabel] = total;
      });
      return row;
    });

    const monthLabels = months.map(({ month }) => monthNames[month - 1].slice(0, 3));

    res.status(200).json({ success: true, data: formatted, months: monthLabels });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
const getCrimeReportsByMonth = async (req, res) => {
  try {
    const now = new Date();
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const data = await Post.aggregate([
      {
        $match: {
          createdAt: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    const monthNames = ["January","February","March","April","May","June",
                        "July","August","September","October","November","December"];

    // Build a lookup map from DB results: "2024-9" -> 42
    const countMap = {};
    data.forEach((item) => {
      const key = `${item._id.year}-${item._id.month}`;
      countMap[key] = item.count;
    });

    // Generate all 12 months and fill with 0 if no data
    const formatted = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${month}`;
      formatted.push({
        month: monthNames[month - 1],
        count: countMap[key] || 0
      });
    }

    res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getTopCrimeTypesLast30Days = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 180);

    const data = await Post.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: "$crimeType",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 6 }
    ]);

    const formatted = data.map(item => ({
      crimeType: item._id,
      count: item.count
    }));

    res.status(200).json({
      success: true,
      data: formatted
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


const getMissingPersonsByAgeGroup = async (req, res) => {
  try {
    const data = await MissingPerson.aggregate([
      {
        $match: { status: "Missing" }
      },
      {
        $bucket: {
          groupBy: "$age",
          boundaries: [0, 13, 19, 31, 51, 200],
          default: "Other",
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ]);

    const labels = [
      "0-12",
      "13-18",
      "19-30",
      "31-50",
      "51+"
    ];

    const formatted = data.map((item, index) => ({
      ageGroup: labels[index],
      count: item.count
    }));

    res.status(200).json({
      success: true,
      data: formatted
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getMissingPersonsByGenderOverTime = async (req, res) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const data = await MissingPerson.aggregate([
      {
        $match: {
          status: "Missing",
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            gender: "$gender"
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const monthNames = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December"
    ];

    // Build lookup
    const lookup = {};
    data.forEach(item => {
      const key = `${item._id.year}-${item._id.month}-${item._id.gender}`;
      lookup[key] = item.count;
    });

    // Generate last 6 months
    const formatted = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const label = monthNames[month - 1];

      formatted.push({
        month: label,
        Male: lookup[`${year}-${month}-Male`] || 0,
        Female: lookup[`${year}-${month}-Female`] || 0,
        Other: lookup[`${year}-${month}-Other`] || 0,
      });
    }

    res.status(200).json({
      success: true,
      data: formatted
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getMissingPersonsByStatus = async (req, res) => {
  try {
    const data = await MissingPerson.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    const statuses = ["Missing", "Found", "Unknown"];

    const formatted = statuses.map(status => {
      const found = data.find(d => d._id === status);
      return {
        status,
        count: found ? found.count : 0
      };
    });

    res.status(200).json({
      success: true,
      data: formatted
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getTopCrimeCities = async (req, res) => {
  try {
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 6)

    const topCities = await Post.aggregate([
      {
        $match: {
          createdAt: { $gte: lastMonth }
        }
      },

      // split location string by comma
      {
        $addFields: {
          locationParts: { $split: ["$locationText", ","] }
        }
      },

      // usually city is 3rd or 2nd last element
      {
        $addFields: {
          city: {
            $trim: {
              input: { $arrayElemAt: ["$locationParts", -3] }
            }
          }
        }
      },

      {
        $group: {
          _id: "$city",
          count: { $sum: 1 }
        }
      },

      {
        $sort: { count: -1 }
      },

      {
        $limit: 5
      },

      {
        $project: {
          _id: 0,
          city: "$_id",
          count: 1
        }
      }
    ])

    res.json(topCities)

  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Error fetching top crime cities" })
  }
}

//kpis

// helper
const getPercentageChange = (current, previous) => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
};

const getDashboardKPIs = async (req, res) => {
  try {
    const now = new Date();

    // ---- DATE RANGES ----
    const last30 = new Date();
    last30.setDate(now.getDate() - 30);

    const prev30 = new Date();
    prev30.setDate(now.getDate() - 60);

    // =========================
    // 1. CRIME GROWTH RATE
    // =========================
    const [currentReports, previousReports] = await Promise.all([
      Post.countDocuments({ createdAt: { $gte: last30 } }),
      Post.countDocuments({
        createdAt: { $gte: prev30, $lt: last30 },
      }),
    ]);

    const growth = getPercentageChange(currentReports, previousReports);

    let growthStatus = "observe";
    if (growth > 5) growthStatus = "exceed";
    else if (growth < -5) growthStatus = "within";

    // =========================
    // 2. AI PROCESSING RATE
    // =========================
    const totalReports = await Post.countDocuments();
    const processedReports = await Post.countDocuments({
      "aiReport.status": "completed",
    });

    const aiRate =
      totalReports === 0 ? 0 : (processedReports / totalReports) * 100;

    let aiStatus = "observe";
    if (aiRate > 80) aiStatus = "within";
    else if (aiRate < 50) aiStatus = "exceed";
    else aiStatus = "observe";

    // =========================
    // 3. TOP CRIME CITY (LAST 30 DAYS)
    // =========================
    const topCityAgg = await Post.aggregate([
      {
        $match: {
          createdAt: { $gte: last30 },
        },
      },
      {
        $addFields: {
          parts: { $split: ["$locationText", ","] },
        },
      },
      {
        $addFields: {
          city: {
            $trim: {
              input: { $arrayElemAt: ["$parts", -3] },
            },
          },
        },
      },
      {
        $group: {
          _id: "$city",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]);

    const topCity = topCityAgg[0] || { _id: "N/A", count: 0 };

    let cityStatus = "observe";
    if (topCity.count > 20) cityStatus = "exceed";
    else if (topCity.count < 10) cityStatus = "within";

    // =========================
    // 4. MISSING RESOLUTION RATE
    // =========================
    const totalMissing = await MissingPerson.countDocuments();
    const found = await MissingPerson.countDocuments({
      status: "Found",
    });

    const resolutionRate =
      totalMissing === 0 ? 0 : (found / totalMissing) * 100;

    let resolutionStatus = "observe";
    if (resolutionRate > 70) resolutionStatus = "within";
    else if (resolutionRate < 40) resolutionStatus = "exceed";

    // =========================
    // RESPONSE
    // =========================
    res.status(200).json({
      success: true,
      data: [
        {
          title: "Crime Growth Rate",
          value: `${growth.toFixed(1)}%`,
          status: growthStatus,
          range: "vs last 30 days",
        },
        {
          title: "AI Processing Rate",
          value: `${aiRate.toFixed(1)}%`,
          status: aiStatus,
          range: `${processedReports}/${totalReports} processed`,
        },
        {
          title: "Top Crime City",
          value: topCity._id,
          status: cityStatus,
          range: `${topCity.count} reports`,
        },
        {
          title: "Missing Resolution Rate",
          value: `${resolutionRate.toFixed(1)}%`,
          status: resolutionStatus,
          range: `${found}/${totalMissing} found`,
        },
      ],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getCrimeReports = async (req, res) => {
  try {
    const { search, status, crimeType, date, page = 1, limit = 10 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const matchStage = {};

    if (status) matchStage.status = status;
    if (crimeType) matchStage.crimeType = crimeType;

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      matchStage.createdAt = { $gte: start, $lte: end };
    }

    const searchStage = search
      ? {
          $match: {
            $or: [
              { locationText: { $regex: search, $options: "i" } },
              { "user.name": { $regex: search, $options: "i" } },
              { "user.email": { $regex: search, $options: "i" } },
            ],
          },
        }
      : null;

    const pipeline = [
      {
        $lookup: {
          from: "users", // collection name in MongoDB
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

      { $match: matchStage },

      ...(searchStage ? [searchStage] : []),

      { $sort: { createdAt: -1 } },

      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: Number(limit) },
          ],
          total: [
            { $count: "count" }
          ],
        },
      },
    ];

    const result = await Post.aggregate(pipeline);

    const posts = result[0].data;
    const total = result[0].total[0]?.count || 0;

    const formatted = posts.map((post) => ({
      _id: post._id,
      reporter: post.anonymous
        ? { name: "Anonymous", email: "—", profilePicture: null }
        : {
            name: post.user?.name || "Unknown",
            email: post.user?.email || "—",
            profilePicture: post.user?.profilePicture || null,
          },
      crimeType: post.crimeType,
      location: post.locationText,
      date: post.date,
      time: post.time,
      upvotes: post.upvotes?.length || 0,
      downvotes: post.downvotes?.length || 0,
      comments: post.comments?.length || 0,
      status: post.status || "Reported",
      aiReport: post.aiReport || null,
      flagCount: post.flags?.length || 0,
      flagBreakdown: (post.flags || []).reduce((acc, f) => {
        acc[f.reason] = (acc[f.reason] || 0) + 1;
        return acc;
      }, {}),
    }));

    res.status(200).json({
      success: true,
      data: formatted,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPostById = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("user", "name email username profilePicture verified")
      .populate("comments.user", "name username profilePicture verified")
      .populate("comments.replies.user", "name username profilePicture verified")
      .lean();

    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    const flagCount = post.flags?.length || 0;
    const flagBreakdown = (post.flags || []).reduce((acc, f) => {
      acc[f.reason] = (acc[f.reason] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        ...post,
        flagCount,
        flagBreakdown,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updatePostStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "Reported",
      "Under Investigation",
      "Assigned",
      "Resolved",
      "Closed",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const post = await Post.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    

    await Notification.create({
      recipient: post.user,
      sender: req.user.id,
      type: "system",
      message: `Your post status changed to "${status}"`,
      post: post._id,
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Status updated",
      data: post,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getCrimeStats = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalReports,
      todayReports,
      underInvestigation,
      resolvedCases,
    ] = await Promise.all([
      Post.countDocuments(),
      Post.countDocuments({ createdAt: { $gte: todayStart } }),
      Post.countDocuments({ status: "Under Investigation" }),
      Post.countDocuments({ status: "Resolved" }),
    ]);

    res.json({
      totalReports,
      todayReports,
      underInvestigation,
      resolvedCases,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
};


const getMissingPersons = async (req, res) => {
  try {
    const { search, status, gender, date, page = 1, limit = 10 } = req.query;

    const filter = {};

    if (status) filter.status = status;
    if (gender) filter.gender = gender;

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { lastSeenLocation: { $regex: search, $options: "i" } },
      ];
    }

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.lastSeenDate = { $gte: start, $lte: end };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [records, total] = await Promise.all([
      MissingPerson.find(filter)
        .populate("reportedBy", "name email username profilePicture")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      MissingPerson.countDocuments(filter),
    ]);

    const formatted = records.map((p) => ({
      _id: p._id,
      name: p.name,
      age: p.age,
      gender: p.gender,
      height: p.height || "—",
      build: p.build || "—",
      lastSeenDate: p.lastSeenDate,
      lastSeenTime: p.lastSeenTime || "—",
      lastSeenLocation: p.lastSeenLocation,
      status: p.status,
      photo: p.photos?.[0]?.cropped || p.photos?.[0]?.original || null,
      upvotes: p.upvotes?.length || 0,
      downvotes: p.downvotes?.length || 0,
      comments: p.comments?.length || 0,
      reportedBy: {
        name: p.reportedBy?.name || "Unknown",
        email: p.reportedBy?.email || "—",
        profilePicture: p.reportedBy?.profilePicture || null,
      },
    }));

    res.status(200).json({
      success: true,
      data: formatted,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


const updateMissingPersonStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["Missing", "Found", "Unknown"];

    // Validate status
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const record = await MissingPerson.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    // Notification 
    if (record.reportedBy.toString() !== req.user.id.toString()) {
      await Notification.create({
        recipient: record.reportedBy, 
        sender: req.user.id,
        type: "system",
        message: `Status changed to "${status}"`,
        missingPerson: record._id,
      });
    }

    res.status(200).json({
      success: true,
      message: "Status updated",
      data: record,
    });
  } catch (error) {
    console.error("Update Missing Person Status Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getMissingPersonById = async (req, res) => {
  try {
    const person = await MissingPerson.findById(req.params.id)
      .populate("reportedBy", "name email username profilePicture")
      .lean();

    if (!person) return res.status(404).json({ success: false, message: "Not found" });

    res.status(200).json({ success: true, data: person });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


const getMissingPersonStats = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      totalMissing,
      foundPersons,
      reportedToday,
      activeCases
    ] = await Promise.all([
      MissingPerson.countDocuments(),

      MissingPerson.countDocuments({ status: "Found" }),

      MissingPerson.countDocuments({
        createdAt: { $gte: todayStart, $lte: todayEnd }
      }),

      MissingPerson.countDocuments({ status: "Missing" })
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalMissing,
        foundPersons,
        reportedToday,
        activeCases
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


module.exports = {
  getCrimeReportsByMonth,
  getCrimeByTimeOfDay,
  getTopCrimeTypesLast30Days,
  getMissingPersonsByAgeGroup,
  getMissingPersonsByGenderOverTime,
  getMissingPersonsByStatus,
  getTopCrimeCities,
  getDashboardKPIs,
  getCrimeReports,
  getPostById,
  updatePostStatus,
  getCrimeStats,
  getMissingPersons,
  updateMissingPersonStatus,
  getMissingPersonById,
  getMissingPersonStats
};
