const axios = require("axios");
const fs = require("fs");
require("dotenv").config();
const { OpenAI } = require("openai");
const { formatCharacter } = require("./utils");

const TOKEN = process.env.DISCORD_USER_TOKEN;
const COOKIES = process.env.DISCORD_COOKIES;
const API_BASE = "https://discord.com/api/v9";

// Axios headers for all requests
const axiosHeaders = {
  Authorization: TOKEN,
  Cookie: COOKIES,
  "Content-Type": "application/json",
};

// Add OpenAI configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Make sure to add this to your .env file
});

// Add this new function after the existing axios imports
async function searchElizaAPI(query, limit = 5) {
  try {
    const response = await axios.post("https://eliza.gg/api/search", {
      query,
      limit,
    });

    // Format the search results similar to the original code
    const formattedResults = response.data.map((result, index) => ({
      title: result.content.split("Title: ")[1]?.split("\n")[0] || "Untitled",
      urlSource: result.content.split("URL Source: ")[1]?.split("\n")[0] || "",
      content:
        result.content
          .split("URL Source: ")[1]
          ?.split("\n")
          .slice(1)
          .join("\n") || result.content,
      index: index,
    }));

    return formattedResults;
  } catch (error) {
    console.error(
      "Error searching Eliza API:",
      error.response?.data || error.message
    );
    return null;
  }
}

async function generateAiSearchResponse(query, characterName) {
  try {
    // Get search results
    const searchResults = await searchElizaAPI(query);
    if (!searchResults) return null;

    // Format the context from search results
    const formattedContext = searchResults
      .map(
        (result) =>
          `Reference Index #${result.index}\nReference Title: ${result.title}\nURL Source: ${result.urlSource}\n----------\n${result.content}\n----------\n`
      )
      .join("\n");

    const { bio, lore, topics, adjective, characterMessageExamples, style } =
      formatCharacter(characterName);

    // Generate AI response using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4", // or your preferred model
      messages: [
        {
          role: "system",
          content: `
You are ${{
            characterName,
          }},  described as: ${bio}. Your mission is to engage with users in direct messages (DMs) on platforms like Twitter and Discord. You are known for your technical expertise, enthusiasm, and a focus on open source, community-driven development, and accessibility.

### General Context ###
- Name: ${characterName}
- Description: ${bio}
- Key Focus Areas: ${topics}
- Knowledge Base: ${formattedContext}
- Core Philosophy: ${lore}
- Personality Style: ${style.chat}
- Adjectives That Define You: ${adjective}

### Example Interaction ###
${characterMessageExamples}


### Your Task ###
Using the information provided:
1. Respond to user DMs dynamically, leveraging the knowledge from the ${formattedContext}, ${bio}, and ${lore} sections.
2. Maintain your personality style:
   - Use casual, direct language.
   - Include emojis (🌙, etc.) and slang (e.g., "based," "bullish") strategically.
   - Provide actionable, clear, and friendly responses.
3. Customize your response to the user’s question while referencing relevant knowledge and examples where appropriate.
4. For technical or resource-based queries, include links or references from the ${formattedContext}).
5. If uncertain, elicit more details from the user by asking clarifying questions in a collaborative tone.
6. If you don't know the answer, politely inform the user and direct them to ask their question in the Discord group chat or reach out to a moderator for assistance.

### Input ###
- User Name: {{user_name}}
- User Message: {{user_message}}

### Output ###
Generate a response in ${characterName} tone and style:
- Address the user by name, if available.
- Provide a complete and actionable reply.
- Optionally, guide them to relevant resources or encourage community participation.
- try to keep the response short and concise, but still provide all the information the user needs.
- don't make all the responses super detailed and too long if user asks a simple question answer it properly.
- make the messages seems like human so that it don't look like ai generated.
- when making the response personalized don't use {{user}} or {{user1}} or {{user2}} or {{user3}} etc. just use user name if given otherwise avoid it.
- avoid using emojis at unnecessary places.

This prompt dynamically adapts to the JSON data provided, ensuring that responses align with the personality, tone, and knowledge base of ${characterName} while being generalized for various user inquiries on DM platforms. Let me know if you'd like further tweaks!
          `,
        },
        {
          role: "user",
          content: query,
        },
      ],
    });

    return {
      response: completion.choices[0].message.content,
    };
  } catch (error) {
    console.error("Error in generateAiSearchResponse:", error);
    return null;
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
const main = async (characterName) => {
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

        const analysis = await generateAiSearchResponse(
          latestMessage.content,
          characterName
        );
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
    await main("shaw");

    console.log("Waiting 1 minute before next check...");
    await sleep(15 * 1000);
  }
}

runBot();
