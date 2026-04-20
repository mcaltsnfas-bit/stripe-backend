console.log("BOOTING SERVER...");

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();

app.use(express.static("credit-store"));
// --------------------
// MIDDLEWARE
// --------------------
app.use(cors());
app.use(express.json());

// --------------------
// ENV
// --------------------
const PORT = process.env.PORT || 3000;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;

// --------------------
// TEST ROUTE
// --------------------
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/credit-store/index.html");
});

// --------------------
// STRIPE CHECKOUT
// --------------------
app.post("/create-checkout", async (req, res) => {
  try {
    console.log("Request received:", req.body);

    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

    const { credits } = req.body;

    if (!credits) {
      return res.status(400).json({ error: "Missing credits" });
    }

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
      success_url: "https://stripe-backend-1-65oj.onrender.com/success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://stripe-backend-1-65oj.onrender.com/cancel.html"
    });

    res.json({ url: session.url });

  } catch (err) {
    console.log("Stripe error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// START SERVER
// --------------------
app.listen(PORT, () => {
  console.log("SERVER STARTED ON PORT:", PORT);
});