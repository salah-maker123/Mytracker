const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const API_BASE = "https://fortnite-api.com";
const CACHE_TTL = 60 * 1000;
const cache = new Map();

app.use(express.static(__dirname, { index: false }));

// Cache
function getCached(key) {
  const item = cache.get(key);

  if (!item || Date.now() - item.time > CACHE_TTL) {
    return null;
  }

  return item.value;
}

function setCached(key, value) {
  cache.set(key, {
    time: Date.now(),
    value
  });

  if (cache.size > 300) {
    for (const [k, v] of cache) {
      if (Date.now() - v.time > CACHE_TTL) {
        cache.delete(k);
      }
    }
  }
}

// Fortnite API
async function apiGet(url, needsKey = true) {
  const headers = {};

  if (needsKey) {
    if (!process.env.FORTNITE_API_KEY) {
      throw new Error("API_KEY_MISSING");
    }

    headers.Authorization = process.env.FORTNITE_API_KEY;
  }

  const response = await fetch(url, { headers });

  const body = await response.json().catch(() => ({}));

  return {
    response,
    body
  };
}

// Homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Player zoeken
app.get("/api/player", async (req, res) => {
  const name = String(req.query.name || "").trim();

  const forced = String(
    req.query.platform || "auto"
  ).toLowerCase();

  if (!name) {
    return res.status(400).json({
      error: "Vul een spelersnaam in."
    });
  }

  if (name.length > 32) {
    return res.status(400).json({
      error: "Deze spelersnaam is te lang."
    });
  }

  const platforms =
    forced === "auto"
      ? ["epic", "psn", "xbl"]
      : [forced];

  if (
    platforms.some(
      p => !["epic", "psn", "xbl"].includes(p)
    )
  ) {
    return res.status(400).json({
      error: "Ongeldig platform."
    });
  }

  const cacheKey =
    `player:${name.toLowerCase()}:${platforms.join(",")}`;

  const cached = getCached(cacheKey);

  if (cached) {
    return res.json(cached);
  }

  try {
    const results = await Promise.all(
      platforms.map(async platform => {
        const url =
          `${API_BASE}/v2/stats/br/v2?name=${encodeURIComponent(name)}&accountType=${platform}`;

        const { response, body } = await apiGet(url);

        return {
          platform,
          status: response.status,
          body
        };
      })
    );

    const matches = results
      .filter(
        item =>
          item.status === 200 &&
          item.body &&
          item.body.data
      )
      .map(item => ({
        platform: item.platform,
        data: item.body.data
      }));

    if (matches.length > 0) {
      const result = {
        matches,
        autoDetected: forced === "auto"
      };

      setCached(cacheKey, result);

      return res.json(result);
    }

    const status = results.some(
      item => item.status === 429
    )
      ? 429
      : results.some(item => item.status === 403)
      ? 403
      : results.every(item => item.status === 404)
      ? 404
      : 502;

    const error =
      status === 404
        ? "PLAYER_NOT_FOUND"
        : status === 403
        ? "API_FORBIDDEN"
        : status === 429
        ? "RATE_LIMIT"
        : "API_ERROR";

    return res.status(status).json({ error });

  } catch (error) {
    if (error.message === "API_KEY_MISSING") {
      return res.status(503).json({
        error: "API_KEY_MISSING"
      });
    }

    console.error(
      "Player lookup failed:",
      error.message
    );

    return res.status(500).json({
      error: "SERVER_ERROR"
    });
  }
});

// Fortnite skins zoeken
app.get("/api/cosmetics", async (req, res) => {
  const query = String(req.query.q || "").trim();

  if (query.length < 2) {
    return res.status(400).json({
      error: "Zoek minimaal 2 letters."
    });
  }

  const cacheKey =
    `cosmetics:${query.toLowerCase()}`;

  const cached = getCached(cacheKey);

  if (cached) {
    return res.json(cached);
  }

  try {
    const url =
      `${API_BASE}/v2/cosmetics/br/search/all?name=${encodeURIComponent(query)}&matchMethod=contains&language=en`;

    const { response, body } =
      await apiGet(url, false);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "COSMETICS_ERROR"
      });
    }

    const outfits = (body.data || [])
      .filter(
        item =>
          item.type?.value === "outfit" &&
          item.images?.icon
      )
      .slice(0, 30)
      .map(item => ({
        id: item.id,
        name: item.name,
        image: item.images.icon
      }));

    const result = { outfits };

    setCached(cacheKey, result);

    return res.json(result);

  } catch (error) {
    console.error(
      "Cosmetics lookup failed:",
      error.message
    );

    return res.status(500).json({
      error: "COSMETICS_ERROR"
    });
  }
});

// Controleren of server online is
app.get("/health", (req, res) => {
  res.json({
    ok: true
  });
});

// Server starten
app.listen(PORT, () => {
  console.log(
    `MyTracker draait op poort ${PORT}`
  );
});
