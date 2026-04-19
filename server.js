const fs = require("fs");
const path = require("path");

const keysFile = path.join(__dirname, "keys.json");

function loadKeys() {
  try {
    return JSON.parse(fs.readFileSync(keysFile, "utf8"));
  } catch (err) {
    return [];
  }
}

function saveKeys(data) {
  fs.writeFileSync(keysFile, JSON.stringify(data, null, 2));
}

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
app.get("/get-key", (req, res) => {
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
  const keys = loadKeys();

  keys.push({
    key,
    credits,
    used: false,
    createdAt: Date.now()
  });

  saveKeys(keys);

  console.log("Keys saved:", keys);

  res.json({ key, credits });
});

/* =======================
   REDEEM
======================= */
app.post("/redeem", (req, res) => {
  const { key } = req.body;

  const keys = loadKeys();

  const found = keys.find(k => k.key === key);

  if (!found) return res.status(400).json({ error: "Invalid key" });
  if (found.used) return res.status(400).json({ error: "Key already used" });

  found.used = true;
  saveKeys(keys);

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});