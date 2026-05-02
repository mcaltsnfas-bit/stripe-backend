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

// IMPORTANT: USE YOUR LIVE DOMAIN
const API = "https://mcalts.co.uk";

// --------------------
// ADMIN TOKEN
// --------------------
let adminToken = null;

// --------------------
// LOGIN ADMIN
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
    const timeout = setTimeout(() => controller.abort(), 8000);

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
// LOG REDEEM
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
      o.setName("key")
        .setDescription("Your redeem key")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your credits"),

  new SlashCommandBuilder()
    .setName("generatekey")
    .setDescription("Generate a key (admin only)")
    .addIntegerOption(o =>
      o.setName("credits")
        .setDescription("Amount of credits")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("redeemhistory")
    .setDescription("View redeem history (admin only)")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to filter (optional)")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("removecredits")
    .setDescription("Remove credits from a user (admin only)")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Target user")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Amount to remove")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("addcredits")
    .setDescription("Add credits to a user (admin only)")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Target user")
        .setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("Amount to add")
        .setRequired(true)
    )
].map(c => c.toJSON());

// --------------------
// REGISTER COMMANDS
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
    console.error("Command registration error:", err);
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
// INTERACTIONS
// --------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await interaction.deferReply({ ephemeral: true });

    // --------------------
    // REDEEM
    // --------------------
    if (interaction.commandName === "redeem") {
      const key = interaction.options.getString("key");

      const data = await safeFetchJSON(`${API}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          userId: interaction.user.id
        })
      });

      if (!data) return interaction.editReply("❌ Server offline");
      if (!data.success) return interaction.editReply(`❌ ${data.error}`);

      await logRedeem({
        user: interaction.user,
        credits: data.credits,
        key
      });

      return interaction.editReply(`✅ You got ${data.credits} credits`);
    }

    // --------------------
    // BALANCE
    // --------------------
    if (interaction.commandName === "balance") {
      const data = await safeFetchJSON(
        `${API}/balance?userId=${interaction.user.id}`
      );

      if (!data) return interaction.editReply("❌ Server offline");

      return interaction.editReply(`💰 Balance: ${data.credits}`);
    }

    // --------------------
    // GENERATE KEY
    // --------------------
    if (interaction.commandName === "generatekey") {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.editReply("❌ No permission");
      }

      if (!adminToken) {
        await loginAdmin();
      }

      const credits = interaction.options.getInteger("credits");

      const data = await safeFetchJSON(`${API}/admin/generate-key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken
        },
        body: JSON.stringify({ credits })
      });

      if (!data) return interaction.editReply("❌ Server offline");

      return interaction.editReply(`🔑 \`${data.key}\` | ${data.credits} credits`);
    }

    // --------------------
    // REMOVE CREDITS
    // --------------------
    if (interaction.commandName === "removecredits") {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.editReply("❌ No permission");
      }

      const user = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");

      const data = await safeFetchJSON(`${API}/admin/remove-credits`, {
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

      return interaction.editReply(`❌ Removed ${amount} credits from <@${user.id}>`);
    }

    // --------------------
    // ADD CREDITS
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

  } catch (err) {
    console.log("Interaction error:", err);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("❌ Unexpected error");
      }
    } catch {}
  }
});

// --------------------
// LOGIN BOT
// --------------------
client.login(process.env.DISCORD_TOKEN);