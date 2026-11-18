import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.FORTNITE_API_KEY;

app.use(express.static("public"));

app.get("/api/player", async (req, res) => {
    const name = String(req.query.name || "").trim();
    const platform = String(req.query.platform || "epic").toLowerCase();

    if (!name) {
        return res.status(400).json({
            error: "Vul een spelersnaam in."
        });
    }

    if (!["epic", "psn", "xbl"].includes(platform)) {
        return res.status(400).json({
            error: "Ongeldig platform."
        });
    }

    if (!API_KEY) {
        return res.status(503).json({
            error: "API-key ontbreekt."
        });
    }

    try {
        const url = new URL(
            "https://fortnite-api.com/v2/stats/br/v2"
        );

        url.searchParams.set("name", name);
        url.searchParams.set("accountType", platform);
        url.searchParams.set("timeWindow", "lifetime");

        const response = await fetch(url, {
            headers: {
                Authorization: API_KEY
            }
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: "Speler niet gevonden of stats niet beschikbaar."
            });
        }

        const stats = data.data.stats.all.overall;

        res.json({
            player: data.data.account.name,
            wins: stats.wins,
            kills: stats.kills,
            deaths: stats.deaths,
            kd: stats.kd,
            winRate: stats.winRate,
            matches: stats.matches
        });

    } catch (error) {
        res.status(500).json({
            error: "Er ging iets mis."
        });
    }
});

app.listen(PORT, () => {
    console.log(`MyTracker running on port ${PORT}`);
});
