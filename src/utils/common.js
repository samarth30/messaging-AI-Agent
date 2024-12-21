const fs = require("fs");

// Helper function to delay execution
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to load last processed messages
const loadLastProcessed = (filename) => {
  try {
    const saved = JSON.parse(fs.readFileSync(filename, "utf8"));
    return new Map(Object.entries(saved));
  } catch (err) {
    console.log("No previous message history found");
    return new Map();
  }
};

// Function to save last processed messages
const saveLastProcessed = (filename, lastProcessedMessages) => {
  fs.writeFileSync(
    filename,
    JSON.stringify(Object.fromEntries(lastProcessedMessages))
  );
};

module.exports = {
  sleep,
  loadLastProcessed,
  saveLastProcessed,
};
