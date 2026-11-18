const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const API = "https://fortnite-api.com/v2";
const PLATFORMS = ["epic", "psn", "xbl"];

// ---- tiny in-memory cache (keeps us under the API rate limit) ----
const cache = new Map();
function getCache(key) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  cache.delete(key);
  return null;
}
function setCache(key, value, ms) {
  cache.set(key, { value, exp: Date.now() + ms });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
}

// ---- look up one name on one platform ----
async function lookup(name, platform) {
  const key = `p:${platform}:${name.toLowerCase()}`;
  const cached = getCache(key);
  if (cached) return cached;

  let out;
  try {
    const r = await fetch(
      `${API}/stats/br/v2?name=${encodeURIComponent(name)}&accountType=${platform}`,
      { headers: { Authorization: process.env.FORTNITE_API_KEY } }
    );
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.data) out = { platform, status: "found", data: j.data };
    else if (r.status === 404) out = { platform, status: "notfound" };
    else if (r.status === 403) out = { platform, status: "private" };
    else out = { platform, status: "error", code: r.status };
  } catch (e) {
    out = { platform, status: "error", code: 0 };
  }
  if (out.status !== "error") setCache(key, out, 60 * 1000); // 60 seconds
  return out;
}

// ---- pages ----
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ---- player search: platform=auto tries Epic, PSN and Xbox in parallel ----
app.get("/api/search", async (req, res) => {
  if (!process.env.FORTNITE_API_KEY) {
    return res.status(500).json({ code: "NO_KEY" });
  }
  const name = String(req.query.name || "").trim();
  if (!name || name.length > 64) {
    return res.status(400).json({ code: "BAD_NAME" });
  }
  let platform = String(req.query.platform || "auto").toLowerCase();
  if (platform === "xbox") platform = "xbl";
  const list = PLATFORMS.includes(platform) ? [platform] : PLATFORMS;

  const results = await Promise.all(list.map((p) => lookup(name, p)));
  res.json({ results });
});

// ---- Fortnite outfit icons for the avatar picker ----
app.get("/api/skins", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 40);
  if (q.length < 2) return res.json({ skins: [] });
  const key = "s:" + q.toLowerCase();
  const cached = getCache(key);
  if (cached) return res.json(cached);
  try {
    const r = await fetch(
      `${API}/cosmetics/br/search/all?name=${encodeURIComponent(q)}&matchMethod=contains&type=outfit&language=en`
    );
    const j = await r.json().catch(() => ({}));
    const rows = r.ok && Array.isArray(j.data) ? j.data : [];
    const skins = rows
      .filter((x) => x.images && (x.images.smallIcon || x.images.icon))
      .slice(0, 30)
      .map((x) => ({ id: x.id, name: x.name, icon: x.images.smallIcon || x.images.icon }));
    const out = { skins };
    setCache(key, out, 10 * 60 * 1000);
    res.json(out);
  } catch (e) {
    res.status(500).json({ skins: [], error: true });
  }
});

app.listen(PORT, () => console.log(`Mytracker draait op poort ${PORT}`));
