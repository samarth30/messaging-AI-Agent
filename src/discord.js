const axios = require("axios");
require("dotenv").config();
const aiService = require("./services/ai.service");
const {
  sleep,
  loadLastProcessed,
  saveLastProcessed,
} = require("./utils/common");
const BlacklistManager = require("./utils/blacklist");
const MessageStore = require("./utils/messageStore");

// Get character file path from command line arguments
const characterPath = process.argv
  .find((arg) => arg.startsWith("--characters="))
  ?.split("=")[1];

if (!characterPath) {
  console.error(
    'Please provide a character file path using --characters="path/to/character.json"'
  );
  process.exit(1);
}

// Get character name from the file path
const characterName = characterPath.split("/").pop().split(".")[0];

const TOKEN = process.env.DISCORD_USER_TOKEN;
const COOKIES = process.env.DISCORD_COOKIES;
const API_BASE = "https://discord.com/api/v9";

// Axios headers for all requests
const axiosHeaders = {
  Authorization: TOKEN,
  Cookie: COOKIES,
  "Content-Type": "application/json",
};

// Initialize blacklist manager
const blacklistManager = new BlacklistManager("discord");

// Initialize message store
const messageStore = new MessageStore("discord");

// Fetch DM channels
const fetchDMChannels = async () => {
  try {
    const response = await axios.get(`${API_BASE}/users/@me/channels`, {
      headers: axiosHeaders,
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching DMs:", error.response?.data || error.message);
  }
};

// Fetch messages from a DM channel
const fetchMessages = async (channelId) => {
  try {
    const response = await axios.get(
      `${API_BASE}/channels/${channelId}/messages`,
      {
        headers: axiosHeaders,
      }
    );

    // Store each message
    if (response.data && Array.isArray(response.data)) {
      response.data.forEach((message) => {
        messageStore.storeMessage(channelId, message);
      });
    }

    return response.data;
  } catch (error) {
    console.error(
      "Error fetching messages:",
      error.response?.data || error.message
    );
  }
};

// Send a message to a DM channel
const sendMessage = async (channelId, content) => {
  try {
    if (blacklistManager.isBlacklisted(channelId)) {
      console.log(`Skipping blacklisted channel: ${channelId}`);
      return false;
    }

    const nonce = `${Date.now()}${Math.floor(Math.random() * 100000)}`;

    const response = await axios.post(
      `${API_BASE}/channels/${channelId}/messages`,
      {
        content,
        tts: false,
        flags: 0,
        mobile_network_type: "unknown",
      },
      { headers: axiosHeaders }
    );

    // Store the sent message
    if (response.data) {
      messageStore.storeMessage(channelId, response.data);
    }

    console.log("Message sent successfully.");
    return true;
  } catch (error) {
    console.error(
      "Error sending message:",
      error.response?.data || error.message
    );

    // Add to blacklist if we can't send messages to this user
    if (error.response?.data?.code === 50007) {
      blacklistManager.addToBlacklist(
        channelId,
        "Cannot send messages to this user"
      );
      console.log(`Channel ${channelId} added to blacklist`);
    }
    return false;
  }
};

// Main function to read DMs and send a response
const main = async (characterName) => {
  try {
    const channels = await fetchDMChannels();
    if (!channels) return;

    channels.reverse();

    for (const channel of channels) {
      if (blacklistManager.isBlacklisted(channel.id)) {
        console.log(`Skipping blacklisted channel: ${channel.id}`);
        continue;
      }

      const channelMessages = await fetchMessages(channel.id);
      if (channelMessages && channelMessages?.length > 0) {
        const latestMessage = channelMessages[0];

        if (shouldSkipMessage(latestMessage)) continue;

        const content = getMessageHistory(channelMessages);
        console.log("content: ", content);
        if (content?.length === 0) continue;

        const analysis = await aiService.generateResponse(
          content,
          characterName
        );

        if (analysis?.response) {
          const sent = await sendMessage(channel.id, analysis.response);
          if (sent) {
            console.log(`Responded to channel ${channel.id}`);
            await sleep(120 * 1000);
          }
        }
      }

      await sleep(3000);
    }
  } catch (error) {
    console.error("Error in main function:", error);
  }
};

function shouldSkipMessage(message) {
  return (
    message.author.bot ||
    message.author.username === process.env.DISCORD_USER_NAME ||
    message.content?.includes("👍")
  );
}

function getMessageHistory(messages) {
  const content = [];
  for (const message of messages) {
    if (message.author.username === process.env.DISCORD_USER_NAME) {
      break;
    }
    content.push(message.content);
  }
  return content.reverse().join("\n");
}

// Run the main function continuously
async function runBot() {
  console.log(
    `Starting bot with character: ${characterName} from ${characterPath}`
  );

  while (true) {
    await main(characterName);

    console.log("Waiting 1 minute before next check...");
    await sleep(15 * 1000);
  }
}

runBot();
