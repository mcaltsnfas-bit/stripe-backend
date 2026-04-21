require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent
]
});

client.on("ready", () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith("!redeem")) {
    const args = message.content.split(" ");
    const key = args[1];

    if (!key) {
      return message.reply("Use: !redeem YOUR_KEY");
    }

    try {
      const res = await fetch(
        "https://stripe-backend-1-65oj.onrender.com/redeem",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ key })
        }
      );

      const data = await res.json();

      if (data.success) {
        message.reply(`✅ You got ${data.credits} credits`);
      } else {
        message.reply(`❌ ${data.error}`);
      }

    } catch (err) {
      console.log(err);
      message.reply("Server error");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);