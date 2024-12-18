const { Scraper } = require("agent-twitter-client");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const OpenAI = require("openai");

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

// Function to generate AI response using OpenAI
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

few examples 
Hey Shawn we want to do collaboration with you can we do it.
This is a collaboration message 
→ Response: please connect with Business Development team please contact @jasyn_bjorn in discord

   Few links 
   https://ai16z.github.io/eliza/
   https://discord.com/invite/ai16z
   https://twitter.com/ai16zdao
Analyze this message: "${message}"

Provide response in JSON format with:
{
  "messageType": "verification|technical|partnership|appreciation|scam|token|general",
  "tone": {
    "urgency": "low|medium|high",
    "sentiment": "positive|neutral|negative",
    "formality": "casual|professional"
  },
  "recommendedAction": "autoReply|routeToBizDev|routeToTech|ignore",
  "suggestedResponse": "string or null",
  "routeTo": "bizDev|techTeam|community|null",
  "followUpNeeded": boolean,
  "securityConcern": boolean
}

Important: Return only the JSON object without any markdown formatting or additional text.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content:
            "You are an AI assistant analyzing Twitter DMs. Respond only with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });

    const response = completion.choices[0].message.content;
    console.log("Raw AI Response:", response);

    // Clean the response by removing markdown formatting if present
    const cleanedResponse = response.replace(/```json\n?|\n?```/g, "").trim();
    console.log("Cleaned Response:", cleanedResponse);

    return JSON.parse(cleanedResponse);
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
      const messages = conversation.messages;

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
      await sleep(10 * 60 * 1000); // Wait 10 minutes
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Start the script
main();
