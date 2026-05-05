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
// RAW WEBHOOK BODIES
// IMPORTANT: these must be BEFORE express.json()
// --------------------
app.use("/webhook", express.raw({ type: "application/json" }));
app.use("/gocardless-webhook", express.raw({ type: "application/json" }));

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
const MOD_SECRET = process.env.MOD_SECRET;

const GOCARDLESS_ACCESS_TOKEN = process.env.GOCARDLESS_ACCESS_TOKEN;
const GOCARDLESS_WEBHOOK_SECRET = process.env.GOCARDLESS_WEBHOOK_SECRET;
const GOCARDLESS_ENV = process.env.GOCARDLESS_ENV || "sandbox";

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const GOCARDLESS_API =
  GOCARDLESS_ENV === "live"
    ? "https://api.gocardless.com"
    : "https://api-sandbox.gocardless.com";

// --------------------
// PRICES IN PENCE
// --------------------
const priceMap = {
  100: 100,
  200: 190,
  300: 280,
  400: 395,
  500: 475,
  750: 675,
  1000: 900
};

// --------------------
// ADMIN SESSIONS
// role can be "admin" or "mod"
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
let bankPaymentsCollection;

async function connectDB() {
  try {
    await client.connect();
    const db = client.db("creditstore");

    keysCollection = db.collection("keys");
    usersCollection = db.collection("users");
    historyCollection = db.collection("history");
    bankPaymentsCollection = db.collection("bankPayments");

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
  if (!keysCollection || !usersCollection || !historyCollection || !bankPaymentsCollection) {
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
// GOCARDLESS API HELPER
// --------------------
async function gocardlessRequest(path, method = "GET", body = null) {
  if (!GOCARDLESS_ACCESS_TOKEN) {
    throw new Error("GoCardless not configured");
  }

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${GOCARDLESS_ACCESS_TOKEN}`,
      "GoCardless-Version": "2015-07-06",
      "Content-Type": "application/json"
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${GOCARDLESS_API}${path}`, options);
  const text = await res.text();

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    console.log("GoCardless API error:", data);
    throw new Error(data?.error?.message || data?.message || "GoCardless API error");
  }

  return data;
}

// --------------------
// CREATE BANK KEY IF PAYMENT IS FULFILLED
// --------------------
async function createGoCardlessKeyIfPaid(localPaymentId) {
  const paymentDoc = await bankPaymentsCollection.findOne({ localPaymentId });

  if (!paymentDoc) {
    return { status: "not_found" };
  }

  if (paymentDoc.key) {
    return {
      status: "paid",
      key: paymentDoc.key,
      credits: paymentDoc.credits
    };
  }

  const br = await gocardlessRequest(`/billing_requests/${paymentDoc.billingRequestId}`);
  const billingRequest = br.billing_requests;

  if (!billingRequest || billingRequest.status !== "fulfilled") {
    await bankPaymentsCollection.updateOne(
      { localPaymentId },
      {
        $set: {
          status: billingRequest?.status || "pending",
          lastCheckedAt: Date.now()
        }
      }
    );

    return {
      status: billingRequest?.status || "pending"
    };
  }

  const existingKey = await keysCollection.findOne({
    sessionId: `gocardless:${localPaymentId}`
  });

  if (existingKey) {
    await bankPaymentsCollection.updateOne(
      { localPaymentId },
      {
        $set: {
          status: "paid",
          key: existingKey.key,
          paidAt: Date.now()
        }
      }
    );

    return {
      status: "paid",
      key: existingKey.key,
      credits: existingKey.credits
    };
  }

  const key = generateKey();

  await keysCollection.insertOne({
    key,
    sessionId: `gocardless:${localPaymentId}`,
    gocardlessBillingRequestId: paymentDoc.billingRequestId,
    credits: Number(paymentDoc.credits),
    used: false,
    method: "gocardless",
    createdAt: Date.now()
  });

  await bankPaymentsCollection.updateOne(
    { localPaymentId },
    {
      $set: {
        status: "paid",
        key,
        paidAt: Date.now()
      }
    }
  );

  await historyCollection.insertOne({
    type: "gocardless_key_created",
    localPaymentId,
    billingRequestId: paymentDoc.billingRequestId,
    key,
    credits: Number(paymentDoc.credits),
    createdAt: Date.now()
  });

  return {
    status: "paid",
    key,
    credits: Number(paymentDoc.credits)
  };
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
// GOCARDLESS CHECKOUT
// --------------------
app.post("/create-gocardless-checkout", async (req, res) => {
  try {
    if (!checkDB(req, res)) return;

    if (!GOCARDLESS_ACCESS_TOKEN) {
      return res.status(500).json({ error: "GoCardless not configured" });
    }

    const { credits } = req.body;

    if (!priceMap[credits]) {
      return res.status(400).json({ error: "Invalid credit amount" });
    }

    const amount = priceMap[credits];
    const localPaymentId = crypto.randomBytes(18).toString("hex");

    const billingRequestData = await gocardlessRequest("/billing_requests", "POST", {
      billing_requests: {
        payment_request: {
          description: `${credits} MCALTS Credits`,
          amount: String(amount),
          currency: "GBP"
        },
        metadata: {
          localPaymentId,
          credits: String(credits)
        }
      }
    });

    const billingRequest = billingRequestData.billing_requests;

    const flowData = await gocardlessRequest("/billing_request_flows", "POST", {
      billing_request_flows: {
        redirect_uri: `${DOMAIN}/success-bank.html?payment_id=${localPaymentId}`,
        exit_uri: `${DOMAIN}/`,
        links: {
          billing_request: billingRequest.id
        }
      }
    });

    const flow = flowData.billing_request_flows;

    await bankPaymentsCollection.insertOne({
      localPaymentId,
      billingRequestId: billingRequest.id,
      credits: Number(credits),
      amount,
      currency: "GBP",
      status: billingRequest.status || "pending",
      authorisationUrl: flow.authorisation_url,
      createdAt: Date.now()
    });

    res.json({
      success: true,
      url: flow.authorisation_url,
      paymentId: localPaymentId
    });

  } catch (err) {
    console.log("GoCardless checkout error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// STRIPE WEBHOOK
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
        method: "stripe",
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
// GOCARDLESS WEBHOOK
// --------------------
app.post("/gocardless-webhook", async (req, res) => {
  try {
    if (!GOCARDLESS_WEBHOOK_SECRET) {
      return res.status(500).send("GoCardless webhook secret missing");
    }

    if (!checkDB(req, res)) return;

    const signature = req.headers["webhook-signature"];
    const rawBody = req.body;

    const expected = crypto
      .createHmac("sha256", GOCARDLESS_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (!signature || signature !== expected) {
      console.log("Invalid GoCardless webhook signature");
      return res.status(498).send("Invalid signature");
    }

    const body = JSON.parse(rawBody.toString("utf8"));
    const events = body.events || [];

    for (const event of events) {
      const billingRequestId = event.links?.billing_request;

      await historyCollection.insertOne({
        type: "gocardless_webhook",
        action: event.action,
        resourceType: event.resource_type,
        eventId: event.id,
        billingRequestId: billingRequestId || null,
        createdAt: Date.now()
      });

      if (billingRequestId) {
        const paymentDoc = await bankPaymentsCollection.findOne({
          billingRequestId
        });

        if (paymentDoc) {
          await bankPaymentsCollection.updateOne(
            { billingRequestId },
            {
              $set: {
                lastWebhookAction: event.action,
                lastWebhookResourceType: event.resource_type,
                updatedAt: Date.now()
              }
            }
          );

          await createGoCardlessKeyIfPaid(paymentDoc.localPaymentId);
        }
      }
    }

    res.status(204).send();

  } catch (err) {
    console.log("GoCardless webhook error:", err.message);
    res.status(500).send("Webhook error");
  }
});

// --------------------
// GET STRIPE KEY BY SESSION
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
// GET GOCARDLESS KEY BY PAYMENT ID
// --------------------
app.get("/get-gocardless-key-by-id", async (req, res) => {
  try {
    if (!checkDB(req, res)) return;

    const paymentId = req.query.payment_id;

    if (!paymentId) {
      return res.status(400).json({ error: "Missing payment_id" });
    }

    const result = await createGoCardlessKeyIfPaid(String(paymentId));

    if (result.status === "not_found") {
      return res.status(404).json({ error: "Payment not found" });
    }

    if (result.status !== "paid") {
      return res.json({
        status: result.status,
        key: null
      });
    }

    res.json({
      status: "paid",
      key: result.key,
      credits: result.credits
    });

  } catch (err) {
    console.log("Get GoCardless key error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// ADMIN LOGIN
// --------------------
app.post("/admin/login", (req, res) => {
  const { password } = req.body;

  let role = null;

  if (ADMIN_SECRET && password === ADMIN_SECRET) {
    role = "admin";
  } else if (MOD_SECRET && password === MOD_SECRET) {
    role = "mod";
  }

  if (!role) {
    return res.status(403).json({ error: "Invalid password" });
  }

  const token = crypto.randomBytes(24).toString("hex");

  adminSessions.set(token, {
    role,
    expiresAt: Date.now() + 1000 * 60 * 60
  });

  res.json({
    token,
    role
  });
});

// --------------------
// CHECK ADMIN OR MOD
// --------------------
function getSession(req) {
  const token = req.headers["x-admin-token"];
  if (!token) return null;

  const session = adminSessions.get(token);

  if (!session || Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    return null;
  }

  return session;
}

function checkPanelAccess(req, res) {
  const session = getSession(req);

  if (!session) {
    res.status(403).json({ error: "Unauthorized" });
    return null;
  }

  return session;
}

function checkFullAdmin(req, res) {
  const session = checkPanelAccess(req, res);

  if (!session) return false;

  if (session.role !== "admin") {
    res.status(403).json({ error: "Full admin access required" });
    return false;
  }

  return true;
}

// --------------------
// ADMIN: SESSION INFO
// --------------------
app.get("/admin/session", async (req, res) => {
  const session = checkPanelAccess(req, res);
  if (!session) return;

  res.json({
    role: session.role
  });
});

// --------------------
// ADMIN: GENERATE KEY
// FULL ADMIN ONLY
// --------------------
app.post("/admin/generate-key", async (req, res) => {
  if (!checkFullAdmin(req, res)) return;
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
    method: "admin",
    createdAt: Date.now()
  });

  res.json({ success: true, key, credits: amount });
});

// --------------------
// ADMIN/MOD: GET KEYS
// --------------------
app.get("/admin/keys", async (req, res) => {
  const session = checkPanelAccess(req, res);
  if (!session) return;
  if (!checkDB(req, res)) return;

  const keys = await keysCollection
    .find({})
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  res.json(keys);
});

// --------------------
// ADMIN: DELETE KEY
// FULL ADMIN ONLY
// --------------------
app.post("/admin/delete-key", async (req, res) => {
  if (!checkFullAdmin(req, res)) return;
  if (!checkDB(req, res)) return;

  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ error: "Missing key" });
  }

  const result = await keysCollection.deleteOne({ key: String(key) });

  if (result.deletedCount === 0) {
    return res.status(404).json({ error: "Key not found" });
  }

  await historyCollection.insertOne({
    type: "admin_delete_key",
    key: String(key),
    createdAt: Date.now()
  });

  res.json({
    success: true,
    message: "Key deleted"
  });
});

// --------------------
// ADMIN: ADD CREDITS
// FULL ADMIN ONLY
// --------------------
app.post("/admin/add-credits", async (req, res) => {
  if (!checkFullAdmin(req, res)) return;
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
// FULL ADMIN ONLY
// --------------------
app.post("/admin/remove-credits", async (req, res) => {
  if (!checkFullAdmin(req, res)) return;
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
// ADMIN/MOD: REDEEM HISTORY
// --------------------
app.get("/admin/redeem-history", async (req, res) => {
  const session = checkPanelAccess(req, res);
  if (!session) return;
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
  console.log("GOCARDLESS ENV:", GOCARDLESS_ENV);
});