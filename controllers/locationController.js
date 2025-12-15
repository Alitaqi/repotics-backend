const fetch = require("node-fetch");

const searchLocations = async (req, res) => {
  try {
    const { q } = req.query;
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + " Pakistan")}&format=json&limit=5&accept-language=en`,
      { headers: { "Accept": "application/json",
        "User-Agent": "Reportics/1.0 (contact: alitaqi@synctom.com)"
       } }
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
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`,
      { headers: { "Accept": "application/json", "User-Agent": "Reportics/1.0 (contact: alitaqi@synctom.com)" } }
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


//"User-Agent": "Reportics-Location-Service/1.0" if doesnt work then add this in headers