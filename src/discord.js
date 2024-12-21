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

// Add these helper functions
function isRecentMessage(message, timeThresholdMinutes = 60) {
  const messageTime = new Date(message.timestamp);
  const currentTime = new Date();
  const diffInMinutes = (currentTime - messageTime) / (1000 * 60);
  return diffInMinutes <= timeThresholdMinutes;
}

function isConversationStarter(message) {
  const starterPhrases = ["hi", "hey", "hello", "yo", "sup"];
  return starterPhrases.includes(message.content.toLowerCase().trim());
}

// Update the shouldSkipMessage function
function shouldSkipMessage(message) {
  // Basic checks

  // Skip messages that are just links or emojis
  const hasOnlyLinks = /^(https?:\/\/[^\s]+)$/g.test(message.content);
  const hasOnlyEmojis = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\s]+$/u.test(
    message.content
  );
  if (hasOnlyLinks || hasOnlyEmojis) {
    return true;
  }

  // Skip if message is too old
  if (!isRecentMessage(message)) {
    return true;
  }

  // Skip single character or very short messages
  // if (message.content.length <= 2) {
  //   return true;
  // }

  // Skip if it's just a greeting without follow-up
  // if (isConversationStarter(message)) {
  //   // Check if there's a follow-up message within 1 minute
  //   const messages = messageStore.getChannelMessages(message.channel_id);
  //   const hasFollowUp = messages.some(msg =>
  //     msg.author.id === message.author.id &&
  //     msg.id !== message.id &&
  //     Math.abs(new Date(msg.timestamp) - new Date(message.timestamp)) <= 60000 // 1 minute
  //   );
  //   if (!hasFollowUp) return true;
  // }

  return false;
}

// Update the main function
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

        if (
          latestMessage.author.bot ||
          latestMessage.author.username === process.env.DISCORD_USER_NAME ||
          latestMessage.content?.includes("👍")
        ) {
          continue;
        }

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
            // let's make time to 30 seconds
            await sleep(30 * 1000); // Small delay to avoid rate limits
          }
        }
      }
    }
  } catch (error) {
    console.error("Error in main function:", error);
  }
};

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

    console.log("Waiting 10 minutes before next check...");
    await sleep(15 * 60 * 1000);
  }
}

runBot();
