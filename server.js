require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

app.post("/create-checkout", async (req, res) => {
  try {
    const { credits } = req.body;

    const priceMap = {
      100: 100,
      500: 500,
      1000: 1000
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
      success_url: "https://stripe-backend-lzb5.onrender.com/success",
      cancel_url: "https://stripe-backend-lzb5.onrender.com/cancel"
    });

    return res.json({ url: session.url });

  } catch (err) {
    console.log("❌ Stripe error:", err);   // 👈 ADD THIS
    return res.status(500).json({ error: err.message });
  }
});
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});