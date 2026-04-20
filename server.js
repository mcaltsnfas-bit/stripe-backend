console.log("BOOTING SERVER...");

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const Stripe = require("stripe");

const app = express();

// --------------------
// STRIPE WEBHOOK NEEDS RAW BODY
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

const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;

// --------------------
// MONGO
// --------------------
const client = new MongoClient(MONGO_URI || "");

let db;
let keysCollection;

async function connectDB() {
  try {
    if (!MONGO_URI) return console.log("⚠️ MONGO_URI missing");

    await client.connect();
    db = client.db("creditstore");
    keysCollection = db.collection("keys");

    console.log("Mongo connected 🚀");
  } catch (err) {
    console.log("Mongo error:", err);
  }
}

connectDB();

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
// STRIPE CHECKOUT
// --------------------
app.post("/create-checkout", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

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
      success_url: `https://stripe-backend-1-65oj.onrender.com/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://stripe-backend-1-65oj.onrender.com/cancel.html`
    });

    res.json({ url: session.url });

  } catch (err) {
    console.log("Stripe error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// WEBHOOK (STEP 2 — IMPORTANT)
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
    console.log("Webhook error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const key = generateKey();

    if (keysCollection) {
      await keysCollection.insertOne({
        key,
        sessionId: session.id,
        credits: session.amount_total / 100,
        used: false,
        createdAt: Date.now()
      });

      console.log("Key created:", key);
    }
  }

  res.json({ received: true });
});

// --------------------
// GET KEY BY SESSION
// --------------------
app.get("/get-key-by-session", async (req, res) => {
  try {
    const sessionId = req.query.session_id;

    if (!sessionId) {
      return res.status(400).json({ error: "Missing session_id" });
    }

    const record = await keysCollection.findOne({ sessionId });

    if (!record) {
      return res.status(404).json({ error: "Key not ready yet" });
    }

    res.json({
      key: record.key,
      credits: record.credits
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// START SERVER
// --------------------
app.listen(PORT, () => {
  console.log("SERVER STARTED ON PORT:", PORT);
});