require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

app.use(express.static("credit-store"));

app.post("/create-checkout", async (req, res) => {
  try {
    const { credits } = req.body;

    const priceMap = {
      100: 100,
      500: 450,
      1000: 850
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
      success_url: "https://stripe-backend-1-65oj.onrender.com/success",
      cancel_url: "https://stripe-backend-1-65oj.onrender.com/cancel"
    });

    return res.json({ url: session.url });

  } catch (err) {
    console.log("❌ Stripe error:", err);   // 👈 ADD THIS
    return res.status(500).json({ error: err.message });
  }
});
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