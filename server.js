console.log("BOOTING SERVER...");

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const Stripe = require("stripe");

const app = express();

// ----------------------
// MIDDLEWARE
// ----------------------
app.use(cors());
app.use(express.json());

// 👇 THIS IS THE FIX FOR YOUR HTML
app.use(express.static("credit-store"));

// ----------------------
// ENV
// ----------------------
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;

// ----------------------
// KEY GENERATOR
// ----------------------
function generateKey() {
  return "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

// ----------------------
// MONGO
// ----------------------
const client = new MongoClient(MONGO_URI || "");

let db;
let keysCollection;

async function connectDB() {
  try {
    if (!MONGO_URI) {
      console.log("⚠️ MONGO_URI missing");
      return;
    }

    await client.connect();
    db = client.db("creditstore");
    keysCollection = db.collection("keys");

    console.log("Mongo connected 🚀");
  } catch (err) {
    console.log("Mongo error:", err);
  }
}

connectDB();

// ----------------------
// HOME (your HTML now works instead of text)
// ----------------------
// (optional fallback if no index.html exists)
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/credit-store/index.html");
});

// ----------------------
// STATUS CHECK
// ----------------------
app.get("/status", (req, res) => {
  res.json({
    mongo: !!keysCollection,
    stripe: !!stripe
  });
});

// ----------------------
// GET KEY
// ----------------------
app.get("/get-key", async (req, res) => {
  try {
    if (!keysCollection) {
      return res.status(500).json({ error: "DB not ready" });
    }

    const secret = req.query.secret;
    const credits = req.query.credits;

    if (secret !== "MY_SECRET_CODE_123") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (!credits) {
      return res.status(400).json({ error: "Missing credits" });
    }

    const key = generateKey();

    await keysCollection.insertOne({
      key,
      credits: Number(credits),
      used: false,
      createdAt: Date.now()
    });

    console.log("Key created:", key);

    res.json({ key, credits });

  } catch (err) {
    console.log("get-key error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------------
// REDEEM
// ----------------------
app.post("/redeem", async (req, res) => {
  try {
    if (!keysCollection) {
      return res.status(500).json({ error: "DB not ready" });
    }

    const { key } = req.body;

    const found = await keysCollection.findOne({ key });

    if (!found) return res.status(400).json({ error: "Invalid key" });
    if (found.used) return res.status(400).json({ error: "Key already used" });

    await keysCollection.updateOne(
      { key },
      { $set: { used: true } }
    );

    res.json({
      success: true,
      credits: found.credits
    });

  } catch (err) {
    console.log("redeem error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------------
// START SERVER
// ----------------------
app.listen(PORT, () => {
  console.log("SERVER STARTED ON PORT:", PORT);
});