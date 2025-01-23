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
// const characterPath = process.argv
//   .find((arg) => arg.startsWith("--characters="))
//   ?.split("=")[1];

// if (!characterPath) {
//   console.error(
//     'Please provide a character file path using --characters="path/to/character.json"'
//   );
//   process.exit(1);
// }

// Get character name from the file path
// const characterName = characterPath.split("/").pop().split(".")[0];

// Add near the top with other requires
const USER_IDS_PATH = path.resolve(__dirname, "twitter_user_ids.json");

// Add these utility functions for managing cached user IDs
function loadCachedUserIds() {
  try {
    if (fs.existsSync(USER_IDS_PATH)) {
      const data = fs.readFileSync(USER_IDS_PATH, "utf8");
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.error("Error loading cached user IDs:", error);
    return {};
  }
}

function saveUserIds(userIds) {
  try {
    fs.writeFileSync(USER_IDS_PATH, JSON.stringify(userIds, null, 2));
    console.log("User IDs cached successfully");
  } catch (error) {
    console.error("Error saving user IDs cache:", error);
  }
}

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

// get twitter id from cookies function
function getTwitterIdFromCookies() {
  // add try catch
  try {
    // Read cookies from the file system
    const cookiesData = fs.readFileSync(
      path.resolve(__dirname, "twitter_cookies.json"),
      "utf8"
    );
    const cookiesArray = JSON.parse(cookiesData);

    // get twid key value from it
    const twid = cookiesArray.find((cookie) => cookie.key === "twid")?.value;
    const twitterUserId = twid.split("u=")[1];
    return twitterUserId;
  } catch (error) {
    console.error("Error getting twitter id from cookies:", error);
    return null;
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
      // can we load cookies again i wanna get twid key value from it
      const twitterUserId = getTwitterIdFromCookies();
      console.log(twitterUserId, "twitterUserId");
      // Verify if cookies are still valid by making a test request
      try {
        await scraper.getDirectMessageConversations(twitterUserId);
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

// Add helper functions for message filtering
function isRecentMessage(message, timeThresholdMinutes = 60) {
  const messageTime = message.createdAt;
  const currentTime = Date.now();
  const diffInMinutes = (currentTime - messageTime) / (1000 * 60);
  return diffInMinutes <= timeThresholdMinutes;
}

// Update shouldSkipMessage function with more checks
function shouldSkipMessage(message) {
  console.log(message);
  // Skip messages that are just links or emojis
  const hasOnlyLinks = /^(https?:\/\/[^\s]+)$/g.test(message.text);
  const hasOnlyEmojis = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\s]+$/u.test(
    message.text
  );
  if (hasOnlyLinks || hasOnlyEmojis) {
    return true;
  }
  console.log(isRecentMessage(message));
  // Skip if message is too old
  if (!isRecentMessage(message)) {
    return true;
  }

  return false;
}

function getMessageHistory(messages, twitterUserId) {
  const content = [];
  // have to start array from the last message
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.senderId === twitterUserId) {
      break;
    }
    content.push(message.text);
  }
  return content.reverse().join("\n");
}

async function withRetry(operation, maxAttempts = 1) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      console.log(`Attempt ${attempt} failed, retrying...`);
      await sleep(1000 * attempt); // Exponential backoff
    }
  }
}

async function handleRateLimit(error) {
  if (error.status === 429) {
    // Rate limit exceeded
    const resetTime = error.headers?.["x-rate-limit-reset"];
    if (resetTime) {
      const waitTime = resetTime * 1000 - Date.now() + 1000; // Add 1 second buffer
      console.log(`Rate limited. Waiting ${waitTime / 1000} seconds...`);
      await sleep(waitTime);
      return true;
    }
  }
  return false;
}

// Modify the getUserIdByUsername function
async function getUserIdByUsername(scraper, username) {
  // First check the cache
  const cachedIds = loadCachedUserIds();

  if (cachedIds[username]) {
    console.log(`Found cached ID for ${username}: ${cachedIds[username]}`);
    return cachedIds[username]?.userId;
  }

  try {
    const user = await scraper.getProfile(username);
    const userId = user?.userId;

    if (userId) {
      // Update cache with new ID
      cachedIds[username] = { userId, user };
      saveUserIds(cachedIds);
      console.log(`Cached new ID for ${username}: ${userId}`);
    }

    return userId;
  } catch (error) {
    console.error(`Error getting user ID for ${username}:`, error);
    return null;
  }
}

async function monitorAndRetweet(scraper) {
  const accounts = ["eliza_studios", "elizawakesup", "ai16zdao"];

  try {
    // First, get user IDs for all accounts
    const userIdMap = new Map();
    for (const username of accounts) {
      const userId = await getUserIdByUsername(scraper, username);

      if (userId) {
        userIdMap.set(username, userId);
        console.log(`Resolved ${username} to ID: ${userId}`);
      } else {
        console.error(`Could not resolve user ID for ${username}`);
      }
    }

    // Now fetch tweets using user IDs
    for (const [username, userId] of userIdMap) {
      try {
        // Get user's recent tweets using the numeric ID
        let userTweets = await scraper.getUserTweets(userId);
        userTweets = userTweets?.tweets.filter((tweet) => !tweet.isRetweet);
        console.log(`Fetched tweets for ${username} (${userId}):`, userTweets);

        if (!Array.isArray(userTweets)) {
          console.log(`No tweets found to be retweeted for ${username}`);
          continue;
        }

        // Process only the first 10 tweets
        const tweets = userTweets.slice(0, 10);

        for (const tweet of tweets) {
          try {
            // For ai16zdao, retweet everything
            if (username === "ai16zdao") {
              if (!tweet.isRetweet) {
                await scraper.retweet(tweet.id);
                console.log(`Retweeted tweet ${tweet.id} from ${username}`);
                // Add delay between retweets to avoid rate limits
                await sleep(10000);
              }
              continue;
            }

            // For Eliza accounts, only retweet if there's a video
            if (
              (username === "eliza_studios" || username === "elizawakesup") &&
              tweet?.videos?.length > 0 &&
              !tweet.isRetweet
            ) {
              await scraper.retweet(tweet.id);
              console.log(`Retweeted video tweet ${tweet.id} from ${username}`);
              // Add delay between retweets to avoid rate limits
              await sleep(10000);
            }
          } catch (tweetError) {
            console.error(`Error processing tweet ${tweet.id}:`, tweetError);
            continue;
          }
        }
      } catch (userError) {
        console.error(`Error fetching tweets for ${username}:`, userError);
        console.log(userError?.data?.errors);
        continue;
      }
    }
  } catch (error) {
    console.error("Error in monitorAndRetweet:", error);
  }
}

// Modify the main function to include the new monitoring functionality
async function main() {
  try {
    // console.log(
    //   `Starting Twitter bot with character: ${characterName} from ${characterPath}`
    // );

    const scraper = await initializeScraper();

    // Run continuously
    while (true) {
      try {
        // Monitor and retweet
        await monitorAndRetweet(scraper);
      } catch (error) {
        console.error("Error during monitoring cycle:", error);

        // Handle rate limits
        if (await handleRateLimit(error)) {
          continue; // Retry immediately after rate limit wait
        }
      }

      console.log("Waiting 15 minutes before next check...");
      await sleep(15 * 60 * 1000); // Wait 15 minutes
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Start the script
main();
