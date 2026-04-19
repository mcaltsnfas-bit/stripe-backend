const { MongoClient } = require("mongodb");

function generateKey() {
  return "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static("credit-store"));

const client = new MongoClient(process.env.MONGO_URI);

let db;
let keysCollection;

function ensureDB(req, res, next) {
  if (!keysCollection) {
    return res.status(500).json({ error: "DB not ready yet" });
  }
  next();
}

/* =======================
   CREATE CHECKOUT
======================= */
app.post("/create-checkout", async (req, res) => {
  try {
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
      success_url: `https://stripe-backend-1-65oj.onrender.com/success.html?credits=${credits}`,
      cancel_url: "https://stripe-backend-1-65oj.onrender.com/cancel"
    });

    return res.json({ url: session.url });

  } catch (err) {
    console.log("❌ Stripe error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* =======================
   GET KEY (FIXED POSITION)
======================= */
app.get("/get-key", ensureDB, async (req, res) => {
  const credits = req.query.credits;
  const secret = req.query.secret;

  console.log("Generating key for:", credits);

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

  console.log("Saved to MongoDB:", key);

  res.json({ key, credits });
});

/* =======================
   REDEEM
======================= */
app.post("/redeem", ensureDB, async (req, res) => {
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
});

/* =======================
   ROUTES
======================= */
app.get("/", (req, res) => {
  res.send("Stripe backend is running 🚀");
});

app.get("/success", (req, res) => {
  res.send("Payment successful 🎉");
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await client.connect();
    db = client.db("creditstore");
    keysCollection = db.collection("keys");

    console.log("MongoDB connected 🚀");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (err) {
    console.log("MongoDB connection error:", err);
  }
}

startServer();