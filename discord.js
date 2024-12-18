const axios = require("axios");
const fs = require("fs");
require("dotenv").config();
const OpenAI = require("openai");

const TOKEN = process.env.DISCORD_USER_TOKEN;
const COOKIES = process.env.DISCORD_COOKIES;
const API_BASE = "https://discord.com/api/v9";

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Axios headers for all requests
const axiosHeaders = {
  Authorization: TOKEN,
  Cookie: COOKIES,
  "Content-Type": "application/json",
};

// Function to generate AI response using OpenAI (similar to index.js)
async function generateAIResponse(message) {
  const prompt = `Analyze the following message and provide a response recommendation. Use these examples as guidance:

Example Messages and Responses:
1. General Project Questions:
   "Is this the real Shaw/AI16Z?" 
   → Response: "Yes, this is the official account. Be cautious of impersonators. You can verify our official links at [link]"

2. Token/Investment Related:
   "When is the next AI16Z token launch?"
   → Response: "We don't discuss token launches or investment opportunities in DMs. Please follow our official announcements on @ai16zdao for updates."

3. Magic/AI Development:
   "Can you help me understand how to implement AI in my project?"
   → Response: "Check out our resources at [link]. For detailed discussions, join our Discord community where we regularly share AI development insights."

4. Partnership/Business:
   "Would love to explore collaboration opportunities with AI16Z"
   → Response: please connect with Business Development team please contact @jasyn_bjorn in discord
   
5. Technical Support:
   "Having issues with the AI integration"
   → Response: "For technical support, please: 1) Check our documentation at [link] 2) Join our Discord community 3) Open a GitHub issue"

6. Appreciation:
   "Your work on AI is groundbreaking!"
   → Response: "Thank you! We're passionate about advancing AI technology. Stay updated with our latest work by following @shawmakesmagic and @ai16zdao"

7. Scam Reports:
   "Someone is impersonating AI16Z/Shaw"
   → Response: "Thank you for reporting. Please be aware our only official accounts are @shawmakesmagic and @ai16zdao. Report any impersonators to Twitter."
8 can you tell me more about the project
    "hey can you tell me more about the project"
    → Response: "We're excited to share more about our project. Please check out our website at https://ai16z.github.io/eliza/ for more information."    

   Few links 
   https://ai16z.github.io/eliza/
   https://discord.com/invite/ai16z
   https://twitter.com/ai16zdao
Analyze this message: "${message}"

Important: Return only the JSON object without any markdown formatting or additional text.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content:
            "You are an AI assistant analyzing Discord messages. Respond only with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });

    const response = completion.choices[0].message.content;
    const cleanedResponse = response.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleanedResponse);
  } catch (error) {
    console.error("Error generating AI response:", error);
    return {
      messageType: "general",
      tone: {
        urgency: "low",
        sentiment: "neutral",
        formality: "professional",
      },
      recommendedAction: "autoReply",
      suggestedResponse:
        "Thank you for your message. We'll get back to you soon.",
      routeTo: null,
      followUpNeeded: false,
      securityConcern: false,
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
    return response.data; // List of DM channels
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
    // Generate nonce: timestamp + random number
    const nonce = `${Date.now()}${Math.floor(Math.random() * 100000)}`;

    await axios.post(
      `${API_BASE}/channels/${channelId}/messages`,
      {
        content,
        // nonce, // Using the generated nonce instead of hardcoded value
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
  const channels = await fetchDMChannels();
  if (!channels) return;

  // make the channels to be reversed use for loop to do that
  channels.reverse();
  // define an object to store messages
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
    if (i > 10) break;
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

      // Generate AI response
      const analysis = await generateAIResponse(latestMessage.content);

      console.log("Message Analysis:", analysis);
      console.log("Message Content:", latestMessage.content);

      // Send response if recommended
      if (analysis.response) {
        await sendMessage(channel.id, analysis.response);
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

  //   // store messages in a json file
  //   fs.writeFileSync("messages.json", JSON.stringify(allMessages, null, 2));
};

main();
