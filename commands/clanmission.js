const { SlashCommandBuilder } = require("discord.js");
const { AttachmentBuilder } = require("discord.js");
const generateMissionImage = require("../image/generateMissionImage.js");
const { missionData } = require("../missionData.js");

const missionChoices = [
  { name: "Skip", value: "Skip" },
  { name: "Breach", value: "Breach" },
  { name: "B.S.S", value: "B.S.S" },
  { name: "Basic Mission", value: "Basic Mission" },
  { name: "Bayonet", value: "Bayonet" },
  { name: "Clean Up", value: "Clean Up" },
  { name: "Common Only", value: "Common Only" },
  { name: "Cover", value: "Cover" },
  { name: "Hammer", value: "Hammer" },
  { name: "HILDR", value: "HILDR" },
  { name: "Knife", value: "Knife" },
  { name: "Local", value: "Local" },
  { name: "Logistics", value: "Logistics" },
  { name: "Rare Only", value: "Rare Only" },
  { name: "Recon", value: "Recon" },
  { name: "Showdown", value: "Showdown" },
  { name: "Uncommon Only", value: "Uncommon Only" }
];

// Assign operators with special rules:
// - If an operator has the SAME value across all selected (non-skip) missions, place them ONLY in the LAST selected mission
// - Otherwise, place them in the mission where they have the highest value
function assignBestOperators(missions) {
  const selected = missions.filter(m => m && m.toLowerCase() !== 'skip');
  const lastMission = selected[selected.length - 1];

  // Build a per-operator map of mission->value across selected missions
  const perOp = {};
  for (const mission of selected) {
    const ops = missionData[mission] || {};
    for (const [op, value] of Object.entries(ops)) {
      if (!perOp[op]) perOp[op] = {};
      perOp[op][mission] = value;
    }
  }

  // Prepare result buckets
  const results = {};
  for (const mission of selected) results[mission] = [];

  // Decide placement per operator
  for (const [op, valuesByMission] of Object.entries(perOp)) {
    const entries = Object.entries(valuesByMission);
    if (entries.length === 0) continue;

    // Check if all values equal (same-stars rule)
    const firstVal = entries[0][1];
    const allSame = entries.every(([, v]) => v === firstVal) && entries.length > 1;

    if (allSame && lastMission) {
      results[lastMission].push({ op, value: firstVal });
    } else {
      // Pick best mission by highest value
      let bestMission = entries[0][0];
      let bestValue = entries[0][1];
      for (let i = 1; i < entries.length; i++) {
        const [m, v] = entries[i];
        if (v > bestValue) { bestValue = v; bestMission = m; }
      }
      results[bestMission].push({ op, value: bestValue });
    }
  }

  // Sort operators within each mission by value desc, then name asc
  for (const mission of Object.keys(results)) {
    results[mission].sort((a, b) => (b.value - a.value) || a.op.localeCompare(b.op));
  }

  return results;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clanmission")
    .setDescription("Pick missions and get best operators placement for your clan")
    .addStringOption(option => {
      option.setName("m1").setDescription("Mission 1").setRequired(false);
      missionChoices.forEach(choice => option.addChoices(choice));
      return option;
    })
    .addStringOption(option => {
      option.setName("m2").setDescription("Mission 2").setRequired(false);
      missionChoices.forEach(choice => option.addChoices(choice));
      return option;
    })
    .addStringOption(option => {
      option.setName("m3").setDescription("Mission 3").setRequired(false);
      missionChoices.forEach(choice => option.addChoices(choice));
      return option;
    })
    .addStringOption(option => {
      option.setName("m4").setDescription("Mission 4").setRequired(false);
      missionChoices.forEach(choice => option.addChoices(choice));
      return option;
    })
    .addStringOption(option => {
      option.setName("m5").setDescription("Mission 5").setRequired(false);
      missionChoices.forEach(choice => option.addChoices(choice));
      return option;
    })
    .addStringOption(option => {
      option.setName("m6").setDescription("Mission 6").setRequired(false);
      missionChoices.forEach(choice => option.addChoices(choice));
      return option;
    })
    .addStringOption(option => {
      option.setName("m7").setDescription("Mission 7").setRequired(false);
      missionChoices.forEach(choice => option.addChoices(choice));
      return option;
    })
    .addStringOption(option => {
      option.setName("m8").setDescription("Mission 8").setRequired(false);
      missionChoices.forEach(choice => option.addChoices(choice));
      return option;
    }),

  async execute(interaction) {
    // DEFER FIRST, before any processing — this gives us 15 minutes instead of 3 seconds
    let useDeferReply = true;
    try {
      await interaction.deferReply();
      console.log("✅ Deferred successfully");
    } catch (deferErr) {
      console.log("⚠️  Defer failed; using followUp instead. Error:", deferErr && deferErr.code);
      useDeferReply = false;
    }

    // NOW get missions and process
    const missions = [];
    for (let i = 1; i <= 8; i++) {
      const m = interaction.options.getString(`m${i}`);
      missions.push(m ? m : "Skip");
    }

    // Ensure at least one non-skip mission
    const nonSkip = missions.filter(m => m && m.toLowerCase() !== "skip");
    if (nonSkip.length === 0) {
      try {
        return await interaction.followUp("❌ You must pick at least one mission.");
      } catch (err) {
        console.error('Could not send error message:', err && err.message);
      }
      return;
    }

    // Assign best operators (pass full missions so assignment respects all slots)
    const results = assignBestOperators(missions);

    // Build textual reply, preserving skipped slots in output order
    let reply = "**Best operator placement for your clan:**\n\n";
    missions.forEach((m, i) => {
      const header = `M${i + 1} - ${m && m.toLowerCase() !== 'skip' ? m : '(skipped)'}`;
      if (!m || m.toLowerCase() === 'skip') {
        // Skipped mission: just show header
        reply += `${header}\n\n`;
        return;
      }

      const opsList = results[m] && results[m].length ? results[m] : [];
      if (opsList.length === 0) {
        reply += `${header}\n- No operators\n\n`;
        return;
      }

      // Compact inline list, no numbers
      const names = opsList.map(o => o.op).join(' , ');
      reply += `${header}\n- ${names}\n\n`;
    });

    try {
      // Build mission objects for the image — ALWAYS 8 slots (skipped slots kept)
      // Use SAME operators as shown in message (from results)
      const missionObjects = missions.map(m => {
        if (!m || m.toLowerCase() === "skip") {
          return { name: "Skip", operators: [] };
        }
        const missionOps = results[m] || [];
        return {
          name: m,
          operators: missionOps.map(o => ({ name: o.op, value: o.value }))
        };
      });

      // Debug logs to help verify correct input to image generator
      console.log("MISSIONS FOR IMAGE:", missionObjects.map(m => m.name));

      // Generate image buffer
      console.log("Starting image generation...");
      const buffer = await generateMissionImage(missionObjects);
      console.log("Image generated. Buffer:", buffer ? `${buffer.length} bytes` : "null/undefined");

      // Validate buffer
      if (!buffer || buffer.length === 0) {
        console.error("generateMissionImage returned an invalid buffer");
        throw new Error("Invalid image buffer");
      }

      console.log("Creating attachment...");
      const attachment = new AttachmentBuilder(buffer, { name: "clan_mission.png" });
      console.log("Attachment created. Sending reply with image...");

      // Use editReply if deferred, otherwise use followUp
      if (useDeferReply) {
        await interaction.editReply({ content: reply, files: [attachment] });
        console.log("✅ Reply sent successfully with editReply!");
      } else {
        await interaction.followUp({ content: reply, files: [attachment] });
        console.log("✅ Reply sent successfully with followUp!");
      }
      
    } catch (err) {
      console.error("❌ Error in image generation/sending:", err.message || err);
      // Fallback: send textual reply only
      try {
        console.log("Sending fallback text-only reply...");
        if (useDeferReply) {
          await interaction.editReply({ content: reply });
        } else {
          await interaction.followUp({ content: reply });
        }
        console.log("Fallback reply sent");
      } catch (fallbackErr) {
        console.error("Could not send fallback reply:", fallbackErr && fallbackErr.message);
      }
    }
  },
};
