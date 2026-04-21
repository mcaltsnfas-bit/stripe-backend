require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// --------------------
// READY
// --------------------
client.on("clientReady", () => {
  console.log(`🤖 Bot logged in as ${client.user.tag}`);
});

// --------------------
// MESSAGE HANDLER
// --------------------
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();

  // --------------------
  // REDEEM COMMAND
  // --------------------
  if (content.startsWith("!redeem")) {
    const args = content.split(" ");
    const key = args[1];

    if (!key) {
      return message.reply("❌ Use: !redeem YOUR_KEY");
    }

    try {
      const res = await fetch(
        "https://stripe-backend-1-65oj.onrender.com/redeem",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            key,
            userId: message.author.id
          })
        }
      );

      const data = await res.json();

      if (data.success) {
        message.reply(`✅ Redeemed! You got ${data.credits} credits`);
      } else {
        message.reply(`❌ ${data.error}`);
      }

    } catch (err) {
      console.log("Redeem error:", err);
      message.reply("❌ Server error");
    }
  }

  // --------------------
  // BALANCE COMMAND
  // --------------------
  if (content === "!balance") {
    try {
      const res = await fetch(
        `https://stripe-backend-1-65oj.onrender.com/balance?userId=${message.author.id}`
      );

      const data = await res.json();

      message.reply(`💰 Your balance: ${data.credits} credits`);

    } catch (err) {
      console.log("Balance error:", err);
      message.reply("❌ Error fetching balance");
    }
  }
});

// --------------------
// LOGIN
// --------------------
client.login(process.env.DISCORD_TOKEN);