const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const TOKEN = process.env.DISCORD_USER_TOKEN;
const COOKIES = process.env.DISCORD_COOKIES;
const API_BASE = "https://discord.com/api/v9";

// Axios headers for all requests
const axiosHeaders = {
  Authorization: TOKEN,
  Cookie: COOKIES,
  "Content-Type": "application/json",
};

// Function to generate AI response using local API
async function generateAIResponse(input) {
  try {
    const response = await fetch(
      `http://localhost:3000/42aaac77-ba1b-0e96-bb52-db321ddfa6de/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          userId: "discord_user",
          userName: "Discord User",
        }),
      }
    );

    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    data.forEach((message) => console.log(`${"Agent"}: ${message.text}`));
    // get only the last message
    const lastMessage = data[data.length - 1];

    console.log("API Response:", data);

    return {
      response: lastMessage.text,
    };
  } catch (error) {
    console.error("Error generating AI response:", error);
    return {
      response: "Thank you for your message. We'll get back to you soon.",
    };
  }
}

// Helper function to delay execution
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const nonce = `${Date.now()}${Math.floor(Math.random() * 100000)}`;

    await axios.post(
      `${API_BASE}/channels/${channelId}/messages`,
      {
        content,
        tts: false,
        flags: 0,
        mobile_network_type: "unknown",
      },
      { headers: axiosHeaders }
    );
    console.log("Message sent successfully.");
  } catch (error) {
    console.error(
      "Error sending message:",
      error.response?.data || error.message
    );
  }
};

// Main function to read DMs and send a response
const main = async () => {
  try {
    const channels = await fetchDMChannels();
    if (!channels) return;

    channels.reverse();
    const allMessages = {};

    // Load last processed messages
    let lastProcessedMessages = new Map();
    try {
      const saved = JSON.parse(
        fs.readFileSync("discord_last_processed.json", "utf8")
      );
      lastProcessedMessages = new Map(Object.entries(saved));
    } catch (err) {
      console.log("No previous message history found");
    }

    let i = 0;
    for (const channel of channels) {
      if (channel.id !== "1318898251830657115") break;
      console.log(`Reading messages for channel: ${channel.id}`);
      const channelMessages = await fetchMessages(channel.id);

      if (channelMessages && channelMessages.length > 0) {
        // Get the latest message
        const latestMessage = channelMessages[0]; // Discord returns messages in descending order

        // Skip if:
        // 1. Message is from a bot
        // 2. Message is from ourselves
        // 3. Message has already been processed
        if (
          latestMessage.author.bot ||
          latestMessage.author.username === process.env.DISCORD_USER_NAME
        ) {
          continue;
        }

        if (latestMessage.channel_id !== "1318898251830657115") {
          continue;
        }

        const analysis = await generateAIResponse(latestMessage.content);
        console.log("Message Content:", latestMessage.content);
        console.log("AI Response:", analysis);

        // Send response if recommended
        if (analysis.response) {
          await sendMessage(channel.id, analysis.response);
          break;
          console.log(`Responded to channel ${channel.id}`);

          // Add delay after sending each message to avoid rate limits
          console.log("Waiting 2 mins before processing next message...");
          await sleep(120 * 1000); // 2 mins delay between messages
        }

        // Update last processed message
        lastProcessedMessages.set(channel.id, latestMessage.id);
      }

      allMessages[channel.id] = channelMessages;
      await sleep(3000); // Wait 3 seconds before next channel
      i++;
    }

    // Save last processed messages
    //   fs.writeFileSync(
    //     "discord_last_processed.json",
    //     JSON.stringify(Object.fromEntries(lastProcessedMessages))
    //   );
  } catch (error) {
    console.error("Error in main function:", error);
  }
};

// Run the main function continuously
async function runBot() {
  while (true) {
    await main();
    console.log("Waiting 1 minute before next check...");
    await sleep(15 * 1000); // Wait 1 minute before next iteration
  }
}

runBot();
