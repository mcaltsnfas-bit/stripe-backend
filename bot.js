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

// --------------------
// MASKING
// --------------------
function maskUser(user) {
  const name = user.username || "user";
  return name.slice(0, 3) + "***";
}

// --------------------
// SAFE FETCH
// --------------------
async function safeFetchJSON(url, options) {
  try {
    const res = await fetch(url, options);
    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      console.log("❌ Non-JSON response:", text);
      return null;
    }
  } catch (err) {
    console.log("Fetch error:", err);
    return null;
  }
}

// --------------------
// LOGS
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
        { name: "Credits", value: `${data.credits}`, inline: true }
      )
      .setTimestamp();

    channel.send({ embeds: [embed] });
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
    .setDescription("View your recent redeems")
].map(c => c.toJSON());

// --------------------
// REGISTER COMMANDS
// --------------------
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );

  console.log("✅ Commands registered");
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

  // --------------------
  // /redeem
  // --------------------
  if (interaction.commandName === "redeem") {
    await interaction.deferReply({ ephemeral: true });

    const key = interaction.options.getString("key");

    const data = await safeFetchJSON(
      "https://stripe-backend-1-65oj.onrender.com/redeem",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          userId: interaction.user.id
        })
      }
    );

    if (!data) return interaction.editReply("❌ Server error");

    if (data.success) {
      // send to backend history
      await safeFetchJSON(
        "https://stripe-backend-1-65oj.onrender.com/log-redeem",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: interaction.user.id,
            credits: data.credits,
            key
          })
        }
      );

      await logRedeem({
        user: interaction.user,
        credits: data.credits
      });

      return interaction.editReply(`✅ You got ${data.credits} credits`);
    }

    return interaction.editReply(`❌ ${data.error}`);
  }

  // --------------------
  // /balance
  // --------------------
  if (interaction.commandName === "balance") {
    await interaction.deferReply({ ephemeral: true });

    const data = await safeFetchJSON(
      `https://stripe-backend-1-65oj.onrender.com/balance?userId=${interaction.user.id}`
    );

    if (!data) return interaction.editReply("❌ Server error");

    return interaction.editReply(`💰 Balance: ${data.credits}`);
  }

  // --------------------
  // /generatekey
  // --------------------
  if (interaction.commandName === "generatekey") {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.editReply("❌ No permission");
    }

    const credits = interaction.options.getInteger("credits");

    const data = await safeFetchJSON(
      "https://stripe-backend-1-65oj.onrender.com/admin/generate-key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits })
      }
    );

    if (!data) return interaction.editReply("❌ Server error");

    return interaction.editReply(`🔑 \`${data.key}\` | ${data.credits} credits`);
  }

  // --------------------
  // /redeemhistory
  // --------------------
  if (interaction.commandName === "redeemhistory") {
    await interaction.deferReply({ ephemeral: true });

    const data = await safeFetchJSON(
      `https://stripe-backend-1-65oj.onrender.com/history?userId=${interaction.user.id}`
    );

    if (!data || !data.history) {
      return interaction.editReply("❌ No history found");
    }

    const embed = new EmbedBuilder()
      .setTitle("📜 Redeem History")
      .setColor(0x3498db);

    data.history.slice(0, 5).forEach((h, i) => {
      embed.addFields({
        name: `#${i + 1}`,
        value: `💰 ${h.credits} credits\n🔑 ${h.key}`
      });
    });

    return interaction.editReply({ embeds: [embed] });
  }
});

// --------------------
// LOGIN
// --------------------
client.login(process.env.DISCORD_TOKEN);