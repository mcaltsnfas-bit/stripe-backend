console.log("BOOTING SERVER...");

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// ----------------------
// HEALTH CHECK ROUTE
// ----------------------
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

// ----------------------
// PORT (RENDER SAFE)
// ----------------------
const PORT = process.env.PORT || 3000;

// ----------------------
// START SERVER
// ----------------------
app.listen(PORT, () => {
  console.log("SERVER STARTED ON PORT:", PORT);
});