console.log("BOOTING SERVER...");

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();

app.use(cors());
app.use(express.json());

app.post("/create-checkout", async (req, res) => {
  try {
    console.log("Checkout request received:", req.body);

    const { credits } = req.body;

    if (!stripe) {
      return res.status(500).json({ error: "Stripe not configured" });
    }

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
      success_url: `https://stripe-backend-1-65oj.onrender.com/success.html?credits=${credits}`,
      cancel_url: `https://stripe-backend-1-65oj.onrender.com/cancel.html`
    });

    console.log("Stripe session created");

    res.json({ url: session.url });

  } catch (err) {
    console.log("❌ STRIPE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});