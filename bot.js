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
// LOG EMBED
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
      o.setName("key").setDescription("Your key").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your credits"),

  new SlashCommandBuilder()
    .setName("generatekey")
    .setDescription("Admin key generator")
    .addIntegerOption(o =>
      o.setName("credits").setDescription("Credits").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("redeemhistory")
    .setDescription("View redeem history (admin only)")
    .addUserOption(o =>
      o.setName("user").setDescription("User to check").setRequired(false)
    ),

  // 🔥 NEW COMMAND
  new SlashCommandBuilder()
    .setName("removecredits")
    .setDescription("Remove credits from a user (admin only)")
    .addUserOption(o =>
      o.setName("user").setDescription("User").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("amount").setDescription("Amount").setRequired(true)
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
    console.error(err);
  }
})();

// --------------------
// READY
// --------------------
client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// --------------------
// INTERACTIONS
// --------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await interaction.deferReply({ ephemeral: true });

    // --------------------
    // /redeem
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

      if (data.success) {
        await logRedeem({
          user: interaction.user,
          credits: data.credits,
          key
        });

        return interaction.editReply(`✅ You got ${data.credits} credits`);
      }

      return interaction.editReply(`❌ ${data.error}`);
    }

    // --------------------
    // /balance
    // --------------------
    if (interaction.commandName === "balance") {
      const data = await safeFetchJSON(
        `${API}/balance?userId=${interaction.user.id}`
      );

      if (!data) return interaction.editReply("❌ Server offline");

      return interaction.editReply(`💰 Balance: ${data.credits}`);
    }

    // --------------------
    // /generatekey
    // --------------------
    if (interaction.commandName === "generatekey") {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.editReply("❌ No permission");
      }

      const credits = interaction.options.getInteger("credits");

      const data = await safeFetchJSON(`${API}/admin/generate-key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": process.env.ADMIN_SECRET
        },
        body: JSON.stringify({ credits })
      });

      if (!data) return interaction.editReply("❌ Server offline");

      return interaction.editReply(`🔑 \`${data.key}\` | ${data.credits} credits`);
    }

    // --------------------
    // /redeemhistory
    // --------------------
    if (interaction.commandName === "redeemhistory") {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.editReply("❌ No permission");
      }

      const targetUser = interaction.options.getUser("user");
      const userId = targetUser ? targetUser.id : null;

      const url = userId
        ? `${API}/admin/redeem-history?userId=${userId}`
        : `${API}/admin/redeem-history`;

      const data = await safeFetchJSON(url, {
        headers: {
          "x-admin-secret": process.env.ADMIN_SECRET
        }
      });

      if (!data || data.length === 0) {
        return interaction.editReply("❌ No history found");
      }

      const embed = new EmbedBuilder()
        .setTitle("📜 Redeem History")
        .setColor(0x3498db);

      data.slice(0, 10).forEach((h, i) => {
        embed.addFields({
          name: `#${i + 1}`,
          value: `👤 <@${h.userId}>\n💰 ${h.credits} credits\n🔑 ${maskKey(h.key)}`
        });
      });

      return interaction.editReply({ embeds: [embed] });
    }

    // --------------------
    // ❌ /removecredits (NEW)
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
          "x-admin-secret": process.env.ADMIN_SECRET
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

  } catch (err) {
    console.log("❌ Interaction error:", err);
    if (!interaction.replied) {
      interaction.editReply("❌ Unexpected error");
    }
  }
});

// --------------------
// LOGIN
// --------------------
client.login(process.env.DISCORD_TOKEN);