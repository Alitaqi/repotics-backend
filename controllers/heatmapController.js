// controllers/heatmapController.js
import Post from "../models/Post.js";

const getCrimeHeatmapData = async (req, res) => {
  try {
    const { city, type, startDate, endDate } = req.query;

    // 🔍 Build dynamic filters
    const query = {};
    if (city) query["locationText"] = { $regex: city, $options: "i" };
    if (type) query["crimeType"] = { $regex: type, $options: "i" };
    if (startDate || endDate) {
      query["createdAt"] = {};
      if (startDate) query["createdAt"].$gte = new Date(startDate);
      if (endDate) query["createdAt"].$lte = new Date(endDate);
    }

    // 🔍 Fetch matching posts
    const crimes = await Post.find(query).select(
      "_id coordinates crimeType createdAt locationText"
    );

    // 🧩 Convert to GeoJSON format for Mapbox
    const features = crimes
      .filter((c) => c.coordinates && c.coordinates.lat && c.coordinates.lng)
      .map((c) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [c.coordinates.lng, c.coordinates.lat], // ✅ Mapbox expects [lng, lat]
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

export { getCrimeHeatmapData };
