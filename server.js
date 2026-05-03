console.log("BOOTING SERVER...");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const Stripe = require("stripe");
const crypto = require("crypto");

const app = express();

// --------------------
// DOMAIN
// --------------------
const DOMAIN = process.env.DOMAIN || "https://mcalts.co.uk";

// --------------------
// CORS
// --------------------
app.use(cors({
  origin: [
    "https://mcalts.co.uk",
    "http://mcalts.co.uk",
    "http://77.68.102.124:3000",
    "http://localhost:3000"
  ],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "x-admin-token"]
}));

// --------------------
// STRIPE WEBHOOK RAW BODY
// IMPORTANT: this must be BEFORE express.json()
// --------------------
app.use("/webhook", express.raw({ type: "application/json" }));

// --------------------
// MIDDLEWARE
// --------------------
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

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// --------------------
// ADMIN SESSIONS
// --------------------
const adminSessions = new Map();

// --------------------
// MONGO
// --------------------
if (!MONGO_URI) {
  console.log("❌ Missing MONGO_URI in .env");
}

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
// DB CHECK
// --------------------
function checkDB(req, res) {
  if (!keysCollection || !usersCollection || !historyCollection) {
    res.status(500).json({ error: "Database not ready" });
    return false;
  }

  return true;
}

// --------------------
// KEY GEN
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
// STRIPE CHECKOUT
// --------------------
app.post("/create-checkout", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

    const { credits } = req.body;

    const priceMap = {
      100: 100,
      200: 190,
      300: 280,
      400: 395,
      500: 475,
      750: 675,
      1000: 900
    };

    if (!priceMap[credits]) {
      return res.status(400).json({ error: "Invalid credit amount" });
    }

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
      success_url: `${DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${DOMAIN}/cancel.html`
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
  if (!stripe) return res.status(500).send("Stripe not configured");
  if (!STRIPE_WEBHOOK_SECRET) return res.status(500).send("Webhook secret missing");
  if (!checkDB(req, res)) return;

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("Webhook error:", err.message);
    return res.status(400).send("Webhook Error");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const existingKey = await keysCollection.findOne({ sessionId: session.id });

    if (!existingKey) {
      const key = generateKey();
      const credits = Number(session.metadata?.credits || 0);

      await keysCollection.insertOne({
        key,
        sessionId: session.id,
        credits,
        used: false,
        createdAt: Date.now()
      });

      console.log("KEY CREATED:", key);
    } else {
      console.log("KEY ALREADY EXISTS FOR SESSION:", session.id);
    }
  }

  res.json({ received: true });
});

// --------------------
// GET KEY BY SESSION
// --------------------
app.get("/get-key-by-session", async (req, res) => {
  if (!checkDB(req, res)) return;

  const sessionId = req.query.session_id;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing session_id" });
  }

  const keyDoc = await keysCollection.findOne({ sessionId });

  if (!keyDoc) {
    return res.json({});
  }

  res.json({
    key: keyDoc.key,
    credits: keyDoc.credits
  });
});

// --------------------
// ADMIN LOGIN
// --------------------
app.post("/admin/login", (req, res) => {
  const { password } = req.body;

  if (!ADMIN_SECRET || password !== ADMIN_SECRET) {
    return res.status(403).json({ error: "Invalid password" });
  }

  const token = crypto.randomBytes(24).toString("hex");
  adminSessions.set(token, Date.now() + 1000 * 60 * 60);

  res.json({ token });
});

// --------------------
// CHECK ADMIN
// --------------------
function checkAdmin(req, res) {
  const token = req.headers["x-admin-token"];
  const expiry = adminSessions.get(token);

  if (!token || !expiry || Date.now() > expiry) {
    res.status(403).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

// --------------------
// ADMIN: GENERATE KEY
// --------------------
app.post("/admin/generate-key", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  if (!checkDB(req, res)) return;

  const { credits } = req.body;
  const amount = Number(credits);

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid credits amount" });
  }

  const key = generateKey();

  await keysCollection.insertOne({
    key,
    credits: amount,
    used: false,
    createdAt: Date.now()
  });

  res.json({ success: true, key, credits: amount });
});

// --------------------
// ADMIN: GET KEYS
// --------------------
app.get("/admin/keys", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  if (!checkDB(req, res)) return;

  const keys = await keysCollection
    .find({})
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  res.json(keys);
});

// --------------------
// ADMIN: ADD CREDITS
// --------------------
app.post("/admin/add-credits", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  if (!checkDB(req, res)) return;

  const { userId, amount } = req.body;
  const creditAmount = Number(amount);

  if (!userId || !creditAmount || creditAmount <= 0) {
    return res.status(400).json({ error: "Missing or invalid userId/amount" });
  }

  await usersCollection.updateOne(
    { userId: String(userId) },
    { $inc: { credits: creditAmount } },
    { upsert: true }
  );

  await historyCollection.insertOne({
    userId: String(userId),
    type: "admin_add",
    credits: creditAmount,
    createdAt: Date.now()
  });

  res.json({
    success: true,
    message: `Added ${creditAmount} credits to ${userId}`
  });
});

// --------------------
// ADMIN: REMOVE CREDITS
// --------------------
app.post("/admin/remove-credits", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  if (!checkDB(req, res)) return;

  const { userId, amount } = req.body;
  const creditAmount = Number(amount);

  if (!userId || !creditAmount || creditAmount <= 0) {
    return res.status(400).json({ error: "Missing or invalid userId/amount" });
  }

  await usersCollection.updateOne(
    { userId: String(userId) },
    { $inc: { credits: -creditAmount } },
    { upsert: true }
  );

  await historyCollection.insertOne({
    userId: String(userId),
    type: "admin_remove",
    credits: creditAmount,
    createdAt: Date.now()
  });

  res.json({
    success: true,
    message: `Removed ${creditAmount} credits from ${userId}`
  });
});

// --------------------
// ADMIN: REDEEM HISTORY
// --------------------
app.get("/admin/redeem-history", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  if (!checkDB(req, res)) return;

  const userId = req.query.userId;
  const query = userId ? { userId: String(userId) } : {};

  const history = await historyCollection
    .find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  res.json(history);
});

// --------------------
// REDEEM
// --------------------
app.post("/redeem", async (req, res) => {
  if (!checkDB(req, res)) return;

  const { key, userId } = req.body;

  if (!key || !userId) {
    return res.status(400).json({ error: "Missing key or userId" });
  }

  const found = await keysCollection.findOne({ key });

  if (!found) return res.status(400).json({ error: "Invalid key" });
  if (found.used) return res.status(400).json({ error: "Key already used" });

  await keysCollection.updateOne(
    { key },
    {
      $set: {
        used: true,
        usedBy: String(userId),
        usedAt: Date.now()
      }
    }
  );

  await usersCollection.updateOne(
    { userId: String(userId) },
    { $inc: { credits: Number(found.credits) } },
    { upsert: true }
  );

  await historyCollection.insertOne({
    userId: String(userId),
    type: "redeem",
    key,
    credits: Number(found.credits),
    createdAt: Date.now()
  });

  res.json({ success: true, credits: Number(found.credits) });
});

// --------------------
// BALANCE
// --------------------
app.get("/balance", async (req, res) => {
  if (!checkDB(req, res)) return;

  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  const user = await usersCollection.findOne({ userId: String(userId) });

  res.json({
    credits: user ? Number(user.credits || 0) : 0
  });
});

// --------------------
// START
// --------------------
app.listen(PORT, () => {
  console.log("SERVER STARTED ON PORT:", PORT);
  console.log("DOMAIN:", DOMAIN);
});