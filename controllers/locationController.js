const fetch = require("node-fetch");

const searchLocations = async (req, res) => {
  try {
    const { q } = req.query;
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + " Pakistan")}&format=json&limit=5`,
      { headers: { "Accept": "application/json" } }
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Location search failed" });
  }
};

const reverseGeocode = async (req, res) => {
  try {
    const { lat, lon } = req.query;
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { "Accept": "application/json" } }
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Reverse geocode failed" });
  }
};

module.exports = {
  searchLocations,
  reverseGeocode,
};
