require("dotenv").config();
const { REST, Routes } = require("discord.js");

async function wipe(clientId, token, label) {
  const rest = new REST({ version: "10" }).setToken(token);

  console.log(`🧨 Wiping ${label} commands...`);

  await rest.put(
    Routes.applicationCommands(clientId),
    { body: [] }
  );

  console.log(`✅ ${label} global commands wiped`);

  await rest.put(
    Routes.applicationGuildCommands(clientId, process.env.GUILD_ID),
    { body: [] }
  );

  console.log(`✅ ${label} guild commands wiped`);
}

// OLD BOT
wipe(
  process.env.OLD_CLIENT_ID,
  process.env.OLD_BOT_TOKEN,
  "OLD BOT"
);

// NEW BOT
wipe(
  process.env.CLIENT_ID,
  process.env.DISCORD_TOKEN,
  "NEW BOT"
);