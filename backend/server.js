// server.js
const express = require("express");
const cors = require("cors");

const { assessCase } = require("./decisionEngine");

const app = express(); // ✅ app MUST be created BEFORE app.use()

// Middlewares
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, name: "DARA backend", port: 3001 });
});

// Main endpoint
app.post("/cases", (req, res) => {
  try {
    const payload = req.body || {};
    const result = assessCase(payload);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Bad request" });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ DARA backend running on http://localhost:${PORT}`);
});
