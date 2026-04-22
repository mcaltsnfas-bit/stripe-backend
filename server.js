console.log("BOOTING SERVER...");

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const Stripe = require("stripe");

const app = express();

// --------------------
// WEBHOOK RAW BODY
// --------------------
app.use("/webhook", express.raw({ type: "application/json" }));

// --------------------
// MIDDLEWARE
// --------------------
app.use(cors());
app.use(express.json());
app.use(express.static("credit-store"));

// --------------------
// ENV
// --------------------
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;

// --------------------
// MONGO
// --------------------
const client = new MongoClient(MONGO_URI || "");

let keysCollection;
let usersCollection;
let historyCollection;

async function connectDB() {
  try {
    await client.connect();
    const db = client.db("creditstore");

    keysCollection = db.collection("keys");
    usersCollection = db.collection("users");
    historyCollection = db.collection("history");

    console.log("Mongo connected 🚀");
  } catch (err) {
    console.log("Mongo error:", err);
  }
}
connectDB();

// --------------------
// 🔒 ADMIN PROTECTION
// --------------------
function checkAdmin(req, res) {
  const secret = req.headers["x-admin-secret"];

  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    res.status(403).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

// --------------------
// KEY GENERATOR
// --------------------
function generateKey() {
  return "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

// --------------------
// HOME
// --------------------
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/credit-store/index.html");
});

// --------------------
// CREATE CHECKOUT
// --------------------
app.post("/create-checkout", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

    const { credits } = req.body;

    const priceMap = {
      100: 100,
      200: 180,
      300: 270,
      400: 360,
      500: 450,
      750: 650,
      1000: 800
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `${credits} Credits`
            },
            unit_amount: priceMap[credits]
          },
          quantity: 1
        }
      ],
      metadata: {
        credits: String(credits)
      },
      success_url:
        "https://stripe-backend-1-65oj.onrender.com/success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url:
        "https://stripe-backend-1-65oj.onrender.com/cancel.html"
    });

    res.json({ url: session.url });
  } catch (err) {
    console.log("Stripe error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// WEBHOOK
// --------------------
app.post("/webhook", async (req, res) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send("Webhook Error");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const key = generateKey();
    const credits = session.metadata?.credits;

    await keysCollection.insertOne({
      key,
      sessionId: session.id,
      credits: Number(credits),
      used: false,
      createdAt: Date.now()
    });

    console.log("✅ KEY CREATED:", key);
  }

  res.json({ received: true });
});

// --------------------
// 🔑 ADMIN: GENERATE KEY (PROTECTED)
// --------------------
app.post("/admin/generate-key", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  try {
    const { credits } = req.body;

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

    res.json({
      success: true,
      key,
      credits
    });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// --------------------
// 🔐 ADMIN: GET ALL KEYS (PROTECTED) ✅ FIX
// --------------------
app.get("/admin/keys", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  try {
    const keys = await keysCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.json(keys);
  } catch (err) {
    console.log("Error fetching keys:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --------------------
// REDEEM KEY (WITH HISTORY)
// --------------------
app.post("/redeem", async (req, res) => {
  try {
    const { key, userId } = req.body;

    const found = await keysCollection.findOne({ key });

    if (!found) {
      return res.status(400).json({ error: "Invalid key" });
    }

    if (found.used) {
      return res.status(400).json({ error: "Key already used" });
    }

    await keysCollection.updateOne(
      { key },
      { $set: { used: true } }
    );

    await usersCollection.updateOne(
      { userId },
      { $inc: { credits: found.credits } },
      { upsert: true }
    );

    await historyCollection.insertOne({
      userId,
      key,
      credits: found.credits,
      createdAt: Date.now()
    });

    res.json({
      success: true,
      credits: found.credits
    });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// --------------------
// 📜 ADMIN: REDEEM HISTORY (PROTECTED)
// --------------------
app.get("/admin/redeem-history", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  try {
    const userId = req.query.userId;

    let query = {};
    if (userId) query.userId = userId;

    const history = await historyCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    res.json(history);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// --------------------
// BALANCE
// --------------------
app.get("/balance", async (req, res) => {
  const userId = req.query.userId;

  const user = await usersCollection.findOne({ userId });

  res.json({
    credits: user ? user.credits : 0
  });
});

// --------------------
// START
// --------------------
app.listen(PORT, () => {
  console.log("SERVER STARTED ON PORT:", PORT);
});