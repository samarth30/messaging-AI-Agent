const fs = require("fs");
const path = require("path");

// Helper function to add headers to content sections
const addHeader = (header, content) => {
  if (!content || content.length === 0) return "";
  return `${header}\n${content}`;
};

// Helper function to format character examples
function formatCharacterExamples(character) {
  const postExamples = (character.postExamples || []).join("\n");

  const messageExamples = (character.messageExamples || [])
    .map((example) =>
      example.map((msg) => `${msg.user}: ${msg.content.text}`).join("\n")
    )
    .join("\n\n");

  return {
    characterPostExamples: postExamples
      ? addHeader(`# Example Posts for ${character.name}`, postExamples)
      : "",
    characterMessageExamples: messageExamples
      ? addHeader(
          `# Example Conversations style for ${character.name}`,
          messageExamples
        )
      : "",
  };
}

// Main function to format character data
function formatCharacter(characterName) {
  try {
    // Load character file from the character folder
    const characterPath = path.join(
      __dirname,
      "../character",
      `${characterName}.character.json`
    );
    const character = JSON.parse(fs.readFileSync(characterPath, "utf8"));

    // Get random bio entries
    const bio = Array.isArray(character.bio)
      ? character.bio
          .sort(() => 0.5 - Math.random())
          .slice(0, 3)
          .join(" ")
      : character.bio || "";

    // Get random lore entries
    const lore =
      character.lore && character.lore.length > 0
        ? [...character.lore]
            .sort(() => Math.random() - 0.5)
            .slice(0, 10)
            .join("\n")
        : "";

    // Format character examples
    const { characterPostExamples, characterMessageExamples } =
      formatCharacterExamples(character);

    // Get random topics
    const topics =
      character.topics && character.topics.length > 0
        ? character.topics
            .sort(() => Math.random() - 0.5)
            .slice(0, 5)
            .join(", ")
        : "";

    // Get random adjective
    const adjective =
      character.adjectives && character.adjectives.length > 0
        ? character.adjectives[
            Math.floor(Math.random() * character.adjectives.length)
          ]
        : "";

    // Format message and post directions
    const messageDirections =
      character.style?.chat?.length > 0
        ? addHeader("# Message Directions", character.style.chat.join("\n"))
        : "";

    const postDirections =
      character.style?.post?.length > 0
        ? addHeader("# Post Directions", character.style.post.join("\n"))
        : "";

    // console.log({
    //   name: character.name,
    //   bio,
    //   lore,
    //   topics,
    //   adjective,
    //   messageDirections,
    //   postDirections,
    //   characterPostExamples,
    //   characterMessageExamples,
    //   knowledge: character.knowledge?.join("\n") || "",
    //   style: {
    //     all: character.style?.all || [],
    //     chat: character.style?.chat || [],
    //     post: character.style?.post || [],
    //   },
    // });

    // Compose the final formatted character data
    return {
      name: character.name,
      bio,
      lore,
      topics,
      adjective,
      messageDirections,
      postDirections,
      characterPostExamples,
      characterMessageExamples,
      knowledge: character.knowledge?.join("\n") || "",
      style: {
        all: character.style?.all || [],
        chat: character.style?.chat || [],
        post: character.style?.post || [],
      },
    };
  } catch (error) {
    console.error(`Error formatting character ${characterName}:`, error);
    return null;
  }
}

module.exports = {
  formatCharacter,
};
