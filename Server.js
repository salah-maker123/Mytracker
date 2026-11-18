const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Homepage tonen
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Andere bestanden laden
app.use(express.static(__dirname));

// Fortnite-speler opzoeken
app.get("/api/player", async (req, res) => {
  try {
    const { name, platform = "epic" } = req.query;

    if (!name) {
      return res.status(400).json({ error: "Vul een spelersnaam in." });
    }

    const response = await fetch(
      `https://fortnite-api.com/v2/stats/br/v2?name=${encodeURIComponent(name)}&accountType=${platform}`,
      {
        headers: {
          Authorization: process.env.FORTNITE_API_KEY
        }
      }
    );

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: "Er ging iets mis." });
  }
});

app.listen(PORT, () => {
  console.log(`Mytracker draait op poort ${PORT}`);
});
