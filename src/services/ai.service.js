const OpenAI = require("openai");
const axios = require("axios");
const { formatCharacter } = require("../utils/utils");

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async searchElizaAPI(query, limit = 5) {
    try {
      const response = await axios.post("https://eliza.gg/api/search", {
        query,
        limit,
      });

      const formattedResults = response.data.map((result, index) => ({
        title: result.content.split("Title: ")[1]?.split("\n")[0] || "Untitled",
        urlSource:
          result.content.split("URL Source: ")[1]?.split("\n")[0] || "",
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

  async generateResponse(query, characterName) {
    try {
      const searchResults = await this.searchElizaAPI(query);
      if (!searchResults) return null;

      const formattedContext = searchResults
        .map(
          (result) =>
            `Reference Index #${result.index}\nReference Title: ${result.title}\nURL Source: ${result.urlSource}\n----------\n${result.content}\n----------\n`
        )
        .join("\n");

      const { bio, lore, topics, adjective, characterMessageExamples, style } =
        formatCharacter(characterName);

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `
You are ${characterName}, described as: ${bio}. Your mission is to engage with users in direct messages (DMs) on platforms like Twitter and Discord. You are known for your technical expertise, enthusiasm, and a focus on open source, community-driven development, and accessibility.

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
3. Customize your response to the user's question while referencing relevant knowledge and examples where appropriate.
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

This prompt dynamically adapts to the JSON data provided, ensuring that responses align with the personality, tone, and knowledge base of ${characterName} while being generalized for various user inquiries on DM platforms. Let me know if you'd like further tweaks!`,
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
      console.error("Error generating AI response:", error);
      return null;
    }
  }
}

module.exports = new AIService();
