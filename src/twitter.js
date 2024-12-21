const { Scraper } = require("agent-twitter-client");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const aiService = require("./services/ai.service");
const {
  sleep,
  loadLastProcessed,
  saveLastProcessed,
} = require("./utils/common");
const BlacklistManager = require("./utils/blacklist");
const MessageStore = require("./utils/messageStore");

// Initialize blacklist manager
const blacklistManager = new BlacklistManager("twitter");

// Initialize message store
const messageStore = new MessageStore("twitter");

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

async function processDirectMessages(scraper) {
  try {
    const conversations = await scraper.getDirectMessageConversations(
      process.env.TWITTER_USER_ID
    );

    const lastProcessedMessages = loadLastProcessed("last_processed.json");

    for (const conversation of conversations.conversations) {
      const { conversationId, messages } = conversation;

      if (!messages?.length) continue;

      // Store messages
      messages.forEach((message) => {
        messageStore.storeMessage(conversationId, message);
      });

      if (blacklistManager.isBlacklisted(conversationId)) {
        console.log(`Skipping blacklisted conversation: ${conversationId}`);
        continue;
      }

      const lastMessage = messages[messages.length - 1];

      if (shouldSkipMessage(lastMessage)) continue;

      const content = getMessageHistory(messages);

      if (content?.length === 0) continue;

      const analysis = await aiService.generateResponse(content, characterName);

      if (analysis?.response) {
        try {
          const response = await scraper.sendDirectMessage(
            conversationId,
            analysis.response
          );
          // Store sent message if available
          if (response) {
            messageStore.storeMessage(conversationId, response);
          }
          console.log(`Responded to conversation ${conversationId}`);
          await sleep(30 * 1000);
        } catch (error) {
          console.error("Error sending message:", error);
          if (error.message.includes("Cannot send messages to this user")) {
            blacklistManager.addToBlacklist(
              conversationId,
              "Cannot send messages to this user"
            );
            console.log(`Conversation ${conversationId} added to blacklist`);
          }
        }
      }

      lastProcessedMessages.set(conversationId, lastMessage.id);
    }

    saveLastProcessed("last_processed.json", lastProcessedMessages);
  } catch (error) {
    console.error("Error processing messages:", error);
  }
}

function shouldSkipMessage(message) {
  return (
    message.senderId === process.env.TWITTER_USER_ID ||
    message.text.includes("Reacted with") ||
    message.text.includes(":")
  );
}

function getMessageHistory(messages) {
  const content = [];
  // have to start array from the last message
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.senderId === process.env.TWITTER_USER_ID) {
      break;
    }
    content.push(message.text);
  }
  return content.reverse().join("\n");
}

async function main() {
  try {
    console.log(
      `Starting Twitter bot with character: ${characterName} from ${characterPath}`
    );

    const scraper = await initializeScraper();

    // Run continuously
    while (true) {
      await processDirectMessages(scraper);
      console.log("Waiting 10 minutes before next check...");
      await sleep(30 * 60 * 1000); // Wait 10 minutes
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Start the script
main();
