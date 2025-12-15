const Post = require("../models/Post");

const getCrimeHeatmapData = async (req, res) => {
  try {
    const { city, type, startDate, endDate } = req.query;

    //  Build dynamic filters
    const query = {};
    if (city) query["locationText"] = { $regex: city, $options: "i" };
    if (type) query["crimeType"] = { $regex: type, $options: "i" };
    if (startDate || endDate) {
      query["createdAt"] = {};
      if (startDate) query["createdAt"].$gte = new Date(startDate);
      if (endDate) query["createdAt"].$lte = new Date(endDate);
    }

    //  Fetch matching posts
    const crimes = await Post.find(query).select(
      "_id coordinates crimeType createdAt locationText"
    );

    //  Convert to GeoJSON format for Mapbox
    const features = crimes
      .filter((c) => c.coordinates && c.coordinates.lat && c.coordinates.lng)
      .map((c) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [c.coordinates.lng, c.coordinates.lat], 
        },
        properties: {
          _id: c._id.toString(),
          crimeType: c.crimeType || "Unknown",
          locationText: c.locationText || "Unknown",
          createdAt: c.createdAt,
        },
      }));

    res.json({
      type: "FeatureCollection",
      features,
    });
  } catch (error) {
    console.error("Heatmap API Error:", error);
    res.status(500).json({ message: "Failed to load heatmap data" });
  }
};

///////////////////////////////////////////////////////////////////////////////
// Helper function to get date range for last 3 months
const getLastThreeMonthsDateRange = () => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3);
  
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  };
};

// Helper function to get top 5 cities in Pakistan
const getTopPakistanCities = () => [
  "Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad",
  "Multan", "Peshawar", "Quetta", "Sialkot", "Gujranwala"
];

// 1. Bar Chart: Crime city-wise for last 3 months (top 5 cities)
// 1. Bar Chart: Crime city-wise for last 3 months
const getCityWiseCrimeStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Date filter (default: last 3 months)
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    } else {
      const { startDate: s, endDate: e } = getLastThreeMonthsDateRange();
      dateFilter.createdAt = { $gte: new Date(s), $lte: new Date(e) };
    }

    // Top cities
    const topCities = getTopPakistanCities().slice(0, 5);

    // One aggregation for all cities (faster)
    const stats = await Post.aggregate([
      { $match: dateFilter },
      {
        $match: {
          locationText: { $in: topCities.map(c => new RegExp(c, "i")) }
        }
      },
      {
        $group: {
          _id: "$locationText",
          crimeTypes: { $push: "$crimeType" },
          totalCrimes: { $sum: 1 }
        }
      }
    ]);

    // Final formatted data
    const formatted = topCities.map(city => {
      const entry = stats.find(s => s._id?.toLowerCase().includes(city.toLowerCase()));

      if (!entry)
        return { city, totalCrimes: 0, topCrimeTypes: [] };

      // Count crime types
      const typeCounts = entry.crimeTypes.reduce((acc, t) => {
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {});

      // Top 3 types
      const topTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type, count]) => ({ type, count }));

      return {
        city,
        totalCrimes: entry.totalCrimes,
        topCrimeTypes: topTypes
      };
    });

    res.json({
      success: true,
      data: formatted,
      timeRange: {
        startDate: dateFilter.createdAt.$gte,
        endDate: dateFilter.createdAt.$lte
      }
    });

  } catch (error) {
    console.error("City-wise crime stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch city-wise crime statistics"
    });
  }
};


// 2. Pie Chart: Crime per type for last 3 months
const getCrimeTypeDistribution = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Date filter
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    } else {
      const { startDate: s, endDate: e } = getLastThreeMonthsDateRange();
      dateFilter.createdAt = { $gte: new Date(s), $lte: new Date(e) };
    }

    const allCrimeTypes = [
      "Theft", "Murder", "Harassment", "Fraud", "Cybercrime", "Kidnapping", "Drugs",
      "Vandalism", "Assault", "Domestic Violence", "Robbery", "Bribery",
      "Extortion", "Stalking", "Human Trafficking", "Illegal Weapons",
      "Arson", "Other"
    ];

    // Aggregation
    const stats = await Post.aggregate([
      { $match: dateFilter },
      { $group: { _id: "$crimeType", count: { $sum: 1 } } }
    ]);

    // Map to include all crime types
    const mapped = allCrimeTypes.map(type => {
      const found = stats.find(s => s._id?.toLowerCase() === type.toLowerCase());
      return { crimeType: type, count: found ? found.count : 0 };
    });

    // Summary
    const totalCrimes = mapped.reduce((a, b) => a + b.count, 0);

    const result = mapped
      .filter(i => i.count > 0)
      .map(i => ({
        ...i,
        percentage: totalCrimes ? Math.round((i.count / totalCrimes) * 100) : 0
      }));

    res.json({
      success: true,
      data: result,
      summary: {
        totalCrimes,
        timeRange: {
          startDate: dateFilter.createdAt.$gte,
          endDate: dateFilter.createdAt.$lte
        }
      }
    });
  } catch (error) {
    console.error("Crime type distribution error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch crime type distribution"
    });
  }
};


// 3. Line Chart: Crime trend for last 3 months (monthly breakdown)
const getCrimeTrendStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Date range
    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      const d = getLastThreeMonthsDateRange();
      start = new Date(d.startDate);
      end = new Date(d.endDate);
    }

    const trend = await Post.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 },
          crimeTypes: { $push: "$crimeType" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const formatted = trend.map(item => {
      const types = item.crimeTypes.reduce((acc, t) => {
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {});

      const topTypes = Object.entries(types)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type, count]) => ({ type, count }));

      return {
        month: `${monthNames[item._id.month - 1]} ${item._id.year}`,
        year: item._id.year,
        monthName: monthNames[item._id.month - 1],
        count: item.count,
        topCrimeTypes: topTypes
      };
    });

    // Add percentage change
    const trendWithChange = formatted.map((item, idx) => {
      let change = 0;
      if (idx > 0) {
        const prev = formatted[idx - 1].count;
        change = prev > 0 ? Math.round(((item.count - prev) / prev) * 100) : 100;
      }
      return { ...item, percentageChange: change };
    });

    // Summary
    const totalCrimes = formatted.reduce((a, b) => a + b.count, 0);
    const avg = Math.round(totalCrimes / (formatted.length || 1));
    const peak = formatted.reduce((a, b) => (a.count > b.count ? a : b), formatted[0] || null);

    res.json({
      success: true,
      data: trendWithChange,
      summary: {
        totalCrimes,
        averageMonthly: avg,
        peakMonth: peak,
        timeRange: { startDate: start, endDate: end }
      }
    });

  } catch (error) {
    console.error("Crime trend stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch crime trend statistics"
    });
  }
};


// 4. Combined endpoint for all three reports
const getAllReports = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Call the internal logic directly
    const [city, types, trend] = await Promise.all([
      Post.aggregate([
        // your optimized city-wise logic
      ]),
      Post.aggregate([
        // your optimized type-wise logic
      ]),
      Post.aggregate([
        // your optimized trend logic
      ])
    ]);

    res.json({
      success: true,
      data: {
        cityWiseStats: city,
        crimeTypeDistribution: types,
        crimeTrend: trend
      }
    });

  } catch (err) {
    console.error("Combined reports error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch combined reports"
    });
  }
};


// Helper functions for combined endpoint
async function getCityWiseCrimeStatsData(startDate, endDate) {
  const dateFilter = getDateFilter(startDate, endDate);
  const topCities = getTopPakistanCities().slice(0, 5);
  
  const cityStats = await Promise.all(topCities.map(async (city) => {
    const query = {
      ...dateFilter,
      locationText: { $regex: city, $options: "i" }
    };
    const count = await Post.countDocuments(query);
    return { city, count };
  }));
  
  return cityStats.sort((a, b) => b.count - a.count);
}

async function getCrimeTypeDistributionData(startDate, endDate) {
  const dateFilter = getDateFilter(startDate, endDate);
  
  const stats = await Post.aggregate([
    { $match: dateFilter },
    { $group: { _id: "$crimeType", count: { $sum: 1 } } }
  ]);
  
  return stats;
}

async function getCrimeTrendStatsData(startDate, endDate) {
  const { start, end } = getDateRange(startDate, endDate);
  
  const trend = await Post.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    { $group: { 
      _id: { 
        year: { $year: "$createdAt" }, 
        month: { $month: "$createdAt" } 
      }, 
      count: { $sum: 1 } 
    }},
    { $sort: { "_id.year": 1, "_id.month": 1 } }
  ]);
  
  return trend;
}

function getDateFilter(startDate, endDate) {
  if (startDate || endDate) {
    const filter = { createdAt: {} };
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
    return filter;
  }
  return getLastThreeMonthsDateRangeFilter();
}

function getLastThreeMonthsDateRangeFilter() {
  const { startDate, endDate } = getLastThreeMonthsDateRange();
  return {
    createdAt: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  };
}

function getDateRange(startDate, endDate) {
  if (startDate && endDate) {
    return { start: new Date(startDate), end: new Date(endDate) };
  }
  const range = getLastThreeMonthsDateRange();
  return { start: new Date(range.startDate), end: new Date(range.endDate) };
}

module.exports = {
  getCityWiseCrimeStats,
  getCrimeTypeDistribution,
  getCrimeTrendStats,
  getAllReports,
   getCrimeHeatmapData,
};

