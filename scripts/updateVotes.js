// === Node modules for file I/O ===
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// === Constants ===
const FILE_PATH = path.resolve("rollingVotes.json");
const MAX_ENTRIES = 7;

// === Map participant IDs to readable names ===
const participantNames = {
  "Y2hvaWNlbHktZXUvY29udGVzdHMvVEV4RWhYSGhMdDNWVU9odGlISlAvcGFydGljaXBhbnRzL01meENqT254VWpiaENEdnRQQXZD": "DUSTBIA",
  "Y2hvaWNlbHktZXUvY29udGVzdHMvVEV4RWhYSGhMdDNWVU9odGlISlAvcGFydGljaXBhbnRzL09aMlNGVFpPTmZiZml4Y2N1c1Zp": "WILLCA",
  "Y2hvaWNlbHktZXUvY29udGVzdHMvVEV4RWhYSGhMdDNWVU9odGlISlAvcGFydGljaXBhbnRzLzlaUzdtZW55ZHNWSWpSekdyQXdB": "BREKA",
  "Y2hvaWNlbHktZXUvY29udGVzdHMvVEV4RWhYSGhMdDNWVU9odGlISlAvcGFydGljaXBhbnRzL0g3b3R1cTdQYzdjc1MzT2xEaTFk": "AZRALPH",
  "Y2hvaWNlbHktZXUvY29udGVzdHMvVEV4RWhYSGhMdDNWVU9odGlISlAvcGFydGljaXBhbnRzL3NpNmM2a1JEUlpuQUdVQWhzS201": "KISH"
};

// === Converts ISO date to PH time like "12:30 PM" ===
function formatTimePH(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila"
  });
}

// === Read JSON file safely or return default structure ===
function loadData() {
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { times: [], voteIncrements: {}, baselineVotes: null };
  }
}

// === Write JSON to disk ===
function saveData(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
}

// === Fetch and process vote data ===
async function fetchAndUpdateVotes() {
  try {
    const response = await fetch(
      "https://backend.choicely.com/contests/Y2hvaWNlbHktZXUvY29udGVzdHMvVEV4RWhYSGhMdDNWVU9odGlISlA/vote_counts/"
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const timeLabel = formatTimePH(data.updated); // Based on API update time

    // ✅ Get local PH time when this script is fired (actual time of GitHub Action)
    const nowPH = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date());

    // Load local file
    const rollingData = loadData();

    // 🛡️ Prevent duplicates
    if (rollingData.times.includes(timeLabel)) {
      console.log("🟡 Duplicate timestamp, skipping update.");
      return;
    }

    // ✅ Make sure updateTimesPH exists
    if (!rollingData.updateTimesPH) {
      rollingData.updateTimesPH = [];
    }

    const currentVotes = {};
    for (const [id, info] of Object.entries(data.participants)) {
      const name = participantNames[id] || id.slice(-6);
      currentVotes[name] = info.count;
    }

    // === First fetch ever ===
    if (!rollingData.baselineVotes) {
      rollingData.baselineVotes = currentVotes;
      // rollingData.times.push(timeLabel); im deleting this so that times array is untouched (cause the gain count is still empty)
      // rollingData.updateTimesPH.push(nowPH); also deleting this so that the next update will have actual update

      for (const name of Object.keys(currentVotes)) {
        if (!rollingData.voteIncrements[name]) {
          rollingData.voteIncrements[name] = [];
        }
        // rollingData.voteIncrements[name].push(null); // placeholder also removing this push of null - we only want to start pushing when the actual difference comes in 
      }

      saveData(rollingData);
      console.log(`🟡 Baseline set @ ${nowPH}`);
      return;
    }

    // === Normal update ===
    rollingData.times.push(timeLabel);
    rollingData.updateTimesPH.push(nowPH); // ⏱️ Push PH time

    for (const [name, current] of Object.entries(currentVotes)) {
      const prev = rollingData.baselineVotes[name] || 0;
      const diff = current - prev;

      if (!rollingData.voteIncrements[name]) {
        rollingData.voteIncrements[name] = Array(rollingData.times.length - 1).fill(null);
      }

      rollingData.voteIncrements[name].push(diff);
    }

    // === Trim if over max
    if (rollingData.times.length > MAX_ENTRIES) {
      const excess = rollingData.times.length - MAX_ENTRIES;
      rollingData.times.splice(0, excess);
      rollingData.updateTimesPH.splice(0, excess); // ✂️ Trim this too
      for (const name in rollingData.voteIncrements) {
        rollingData.voteIncrements[name].splice(0, excess);
      }
    }

    rollingData.baselineVotes = currentVotes;
    saveData(rollingData);
    console.log(`✅ Updated @ ${timeLabel} (PH now: ${nowPH})`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}


// === Run once ===
fetchAndUpdateVotes();
