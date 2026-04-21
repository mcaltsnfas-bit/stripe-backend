require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField
} = require("discord.js");

// --------------------
// CLIENT
// --------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// --------------------
// LOG CHANNEL
// --------------------
const logChannelId = process.env.LOG_CHANNEL_ID;

async function logRedeem(message) {
  try {
    if (!logChannelId) return;

    const channel = await client.channels.fetch(logChannelId);
    if (!channel) return;

    channel.send(message);
  } catch (err) {
    console.log("Log error:", err);
  }
}

// --------------------
// SAFE FETCH JSON (FIXES YOUR ERROR)
// --------------------
async function safeFetchJSON(url, options) {
  try {
    const res = await fetch(url, options);

    const text = await res.text(); // IMPORTANT FIX

    try {
      return JSON.parse(text);
    } catch {
      console.log("❌ Non-JSON response from:", url);
      console.log(text);
      return null;
    }
  } catch (err) {
    console.log("Fetch error:", err);
    return null;
  }
}

// --------------------
// COMMANDS
// --------------------
const commands = [
  new SlashCommandBuilder()
    .setName("redeem")
    .setDescription("Redeem a key")
    .addStringOption(option =>
      option.setName("key")
        .setDescription("Your key")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your credits"),

  new SlashCommandBuilder()
    .setName("generatekey")
    .setDescription("Generate a key (admin only)")
    .addIntegerOption(option =>
      option.setName("credits")
        .setDescription("Amount of credits")
        .setRequired(true)
    )
].map(cmd => cmd.toJSON());

// --------------------
// REGISTER COMMANDS
// --------------------
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔄 Registering slash commands...");

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("✅ Slash commands ready");
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

    if (!data) {
      return interaction.editReply("❌ Server error (invalid response)");
    }

    if (data.success) {
      const logMsg = `✅ **Key Redeemed**
👤 User: <@${interaction.user.id}>
🔑 Key: ||${key}||
💰 Credits: ${data.credits}`;

      await logRedeem(logMsg);

      return interaction.editReply(
        `✅ Redeemed! You got ${data.credits} credits`
      );
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

    if (!data) {
      return interaction.editReply("❌ Server error");
    }

    return interaction.editReply(
      `💰 Your balance: ${data.credits} credits`
    );
  }

  // --------------------
  // /generatekey
  // --------------------
  if (interaction.commandName === "generatekey") {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.editReply("❌ You don't have permission.");
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

    if (!data) {
      return interaction.editReply("❌ Server error (invalid response)");
    }

    if (data.success) {
      return interaction.editReply(
        `✅ Key Generated!\n\n🔑 \`${data.key}\`\n💰 ${data.credits} credits`
      );
    }

    return interaction.editReply(`❌ ${data.error}`);
  }
});

// --------------------
// LOGIN
// --------------------
client.login(process.env.DISCORD_TOKEN);