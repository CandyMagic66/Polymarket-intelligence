require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.VITE_ANTHROPIC_KEY;

// ── Proxy Anthropic ──────────────────────────────────────────────────────────
app.post("/api/anthropic", async (req, res) => {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Erreur Anthropic:", err);
    res.status(500).json({ error: "Erreur serveur Anthropic" });
  }
});

// ── Proxy Polymarket ─────────────────────────────────────────────────────────
app.get("/api/markets", async (req, res) => {
  try {
    const response = await fetch(
      "https://gamma-api.polymarket.com/markets?limit=20&active=true&closed=false&order=volume&ascending=false"
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Erreur Polymarket:", err);
    res.status(500).json({ error: "Erreur serveur Polymarket" });
  }
});

// ── Sanity check ─────────────────────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
    anthropic_key: API_KEY ? "✅ configurée" : "❌ manquante",
    timestamp: new Date().toISOString(),
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Serveur proxy démarré sur http://localhost:${PORT}`);
  console.log(`   Clé Anthropic : ${API_KEY ? "✅ détectée" : "❌ non trouvée"}`);
  console.log(`   Status : http://localhost:${PORT}/api/status\n`);
});