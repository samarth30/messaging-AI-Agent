const { Scraper } = require("agent-twitter-client");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const OpenAI = require("openai");
const axios = require("axios");

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to delay execution
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to save cookies
async function saveCookies(scraper) {
  try {
    // Retrieve the current session cookies
    const cookies = await scraper.getCookies();

    // Save the cookies to a JSON file for future sessions
    fs.writeFileSync(
      path.resolve(__dirname, "twitter_cookies.json"),
      JSON.stringify(cookies)
    );

    console.log("Cookies saved successfully.");
  } catch (error) {
    console.error("Error saving cookies:", error);
  }
}

// Function to load cookies
async function loadCookies(scraper) {
  try {
    // Read cookies from the file system
    const cookiesData = fs.readFileSync(
      path.resolve(__dirname, "twitter_cookies.json"),
      "utf8"
    );
    const cookiesArray = JSON.parse(cookiesData);

    // Map cookies to the correct format (strings)
    const cookieStrings = cookiesArray.map((cookie) => {
      return `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${
        cookie.path
      }; ${cookie.secure ? "Secure" : ""}; ${
        cookie.httpOnly ? "HttpOnly" : ""
      }; SameSite=${cookie.sameSite || "Lax"}`;
    });

    // Set the cookies for the current session
    await scraper.setCookies(cookieStrings);

    console.log("Cookies loaded from file.");
    return true;
  } catch (error) {
    console.error("Error loading cookies:", error);
    return false;
  }
}

// Modified initializeScraper function to use the new cookie handling
async function initializeScraper() {
  const scraper = new Scraper();

  try {
    // Try to load existing cookies first
    const cookiesLoaded = await loadCookies(scraper);

    if (cookiesLoaded) {
      // Verify if cookies are still valid by making a test request
      try {
        await scraper.getDirectMessageConversations(
          process.env.TWITTER_USER_ID
        );
        console.log("Existing cookies are valid");
        return scraper;
      } catch (error) {
        console.log("Cookies expired, logging in again...");
      }
    }

    // If no cookies or invalid cookies, perform login
    await scraper.login(
      process.env.TWITTER_USERNAME,
      process.env.TWITTER_PASSWORD,
      process.env.TWITTER_EMAIL
    );

    // Save the new cookies after successful login
    await saveCookies(scraper);

    return scraper;
  } catch (error) {
    console.error("Error in initializeScraper:", error);
    throw error;
  }
}

// Function to generate AI response using local API
async function generateAIResponse(input) {
  // const payload = {
  //   query: message,
  // };

  try {
    // let's use axios to make the request add content type

    const response = await fetch(
      `http://localhost:3000/42aaac77-ba1b-0e96-bb52-db321ddfa6de/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          userId: "user",
          userName: "User",
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

    // Assuming the response structure matches the expected JSON format
    return {
      // messageType: "partnership", // Example, adjust based on your logic
      // tone: {
      //   urgency: "low",
      //   sentiment: "positive",
      //   formality: "casual",
      // },
      // recommendedAction: "autoReply",
      // respond with message.txt how can i do that
      suggestedResponse: lastMessage.text,
      // routeTo: null,
      // followUpNeeded: false,
      // securityConcern: false,
    };
  } catch (error) {
    console.error("Error generating AI response:", error);
    // Return a default response in case of error
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

async function processDirectMessages(scraper) {
  try {
    // Get DM conversations
    const conversations = await scraper.getDirectMessageConversations(
      process.env.TWITTER_USER_ID
    );

    // Store last processed message IDs
    let lastProcessedMessages = new Map();
    try {
      const saved = JSON.parse(fs.readFileSync("last_processed.json", "utf8"));
      lastProcessedMessages = new Map(Object.entries(saved));
    } catch (err) {
      console.log("No previous message history found");
    }

    // Process each conversation
    for (const conversation of conversations.conversations) {
      const conversationId = conversation.conversationId;
      const messages = conversation?.messages;

      if (!messages || messages.length === 0) continue;

      const lastMessage = messages[messages.length - 1];

      // Skip messages sent by us
      if (lastMessage.senderId === process.env.TWITTER_USER_ID) continue;

      // text of last message contains Reacted with
      if (lastMessage.text.includes("Reacted with")) continue;

      // Generate AI response
      const analysis = await generateAIResponse(lastMessage.text);

      console.log("lastMessage: ", lastMessage);
      console.log(analysis);
      // break;

      // Send response if recommended
      if (analysis.suggestedResponse) {
        await scraper.sendDirectMessage(
          conversationId,
          analysis.suggestedResponse
        );

        console.log(`Responded to conversation ${conversationId}`);

        // Add delay after sending each message to avoid rate limits
        console.log("Waiting 2 mins before processing next message...");
        await sleep(120 * 1000); // 2 mins delay between messages
      }

      // Update last processed message
      lastProcessedMessages.set(conversationId, lastMessage.id);
    }

    // Save processed message IDs
    fs.writeFileSync(
      "last_processed.json",
      JSON.stringify(Object.fromEntries(lastProcessedMessages))
    );
  } catch (error) {
    console.error("Error processing messages:", error);
  }
}

async function main() {
  try {
    const scraper = await initializeScraper();

    // Run continuously
    while (true) {
      await processDirectMessages(scraper);
      console.log("Waiting 10 minutes before next check...");
      await sleep(1 * 60 * 1000); // Wait 10 minutes
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Start the script
main();
