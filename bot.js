require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder
} = require("discord.js");

// --------------------
// CLIENT
// --------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// --------------------
// CONFIG
// --------------------
const logChannelId = process.env.LOG_CHANNEL_ID;
const API = "https://stripe-backend-1-65oj.onrender.com";

// --------------------
// ADMIN TOKEN
// --------------------
let adminToken = null;

// --------------------
// LOGIN
// --------------------
async function loginAdmin() {
  const res = await safeFetchJSON(`${API}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      password: process.env.ADMIN_SECRET
    })
  });

  if (res?.token) {
    adminToken = res.token;
    console.log("🔐 Admin logged in");
  } else {
    console.log("❌ Admin login failed");
  }
}

// --------------------
// MASKING
// --------------------
function maskUser(user) {
  const name = user.username || "user";
  return name.slice(0, 3) + "***";
}

function maskKey(key) {
  if (!key) return "INVALID";
  return key.slice(0, 4) + "****" + key.slice(-2);
}

// --------------------
// SAFE FETCH
// --------------------
async function safeFetchJSON(url, options = {}) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeout);

    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      console.log("❌ Non-JSON response:", text);
      return null;
    }
  } catch (err) {
    console.log("Fetch error:", err.message);
    return null;
  }
}

// --------------------
// LOG
// --------------------
async function logRedeem(data) {
  try {
    if (!logChannelId) return;

    const channel = await client.channels.fetch(logChannelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("🧾 Redeem Logged")
      .setColor(0x2ecc71)
      .addFields(
        { name: "User", value: maskUser(data.user), inline: true },
        { name: "Credits", value: `${data.credits}`, inline: true },
        { name: "Key", value: maskKey(data.key), inline: false }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.log("Log error:", err);
  }
}

// --------------------
// COMMANDS
// --------------------
const commands = [
  new SlashCommandBuilder()
    .setName("redeem")
    .setDescription("Redeem a key")
    .addStringOption(o =>
      o.setName("key").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check credits"),

  new SlashCommandBuilder()
    .setName("generatekey")
    .setDescription("Generate key (admin)")
    .addIntegerOption(o =>
      o.setName("credits").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("redeemhistory")
    .setDescription("History (admin)")
    .addUserOption(o =>
      o.setName("user").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("removecredits")
    .setDescription("Remove credits (admin)")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setRequired(true)
    ),

  // ⭐ NEW COMMAND
  new SlashCommandBuilder()
    .setName("addcredits")
    .setDescription("Add credits to a user (admin)")
    .addUserOption(o =>
      o.setName("user").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setRequired(true)
    )
].map(c => c.toJSON());

// --------------------
// REGISTER
// --------------------
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("✅ Commands registered");
  } catch (err) {
    console.error(err);
  }
})();

// --------------------
// READY
// --------------------
client.on("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await loginAdmin();
});

// --------------------
// COMMAND HANDLER
// --------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await interaction.deferReply({ ephemeral: true });

    // --------------------
    // ADD CREDITS ⭐ NEW
    // --------------------
    if (interaction.commandName === "addcredits") {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.editReply("❌ No permission");
      }

      const user = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");

      const data = await safeFetchJSON(`${API}/admin/add-credits`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken
        },
        body: JSON.stringify({
          userId: user.id,
          amount
        })
      });

      if (!data) return interaction.editReply("❌ Server offline");
      if (data.error) return interaction.editReply(`❌ ${data.error}`);

      return interaction.editReply(`✅ Added ${amount} credits to <@${user.id}>`);
    }

    // --------------------
    // (your other commands stay EXACTLY same)
    // --------------------

  } catch (err) {
    console.log("Interaction error:", err);
    if (!interaction.replied) {
      interaction.editReply("❌ Unexpected error");
    }
  }
});

// --------------------
// LOGIN BOT
// --------------------
client.login(process.env.DISCORD_TOKEN);