const fs = require("fs");
const path = require("path");

class MessageStore {
  constructor(platform) {
    this.platform = platform;
    this.messageFile = path.resolve(
      __dirname,
      `../../messages-local/${platform}-messages.json`
    );
    this.messages = this.loadMessages();
  }

  loadMessages() {
    try {
      if (!fs.existsSync(this.messageFile)) {
        // Create messages-local directory if it doesn't exist
        const dir = path.dirname(this.messageFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.messageFile, JSON.stringify({}));
        return {};
      }
      return JSON.parse(fs.readFileSync(this.messageFile, "utf8"));
    } catch (error) {
      console.error(`Error loading messages: ${error.message}`);
      return {};
    }
  }

  saveMessages() {
    try {
      fs.writeFileSync(
        this.messageFile,
        JSON.stringify(this.messages, null, 2)
      );
    } catch (error) {
      console.error(`Error saving messages: ${error.message}`);
    }
  }

  storeMessage(channelId, message) {
    if (!this.messages[channelId]) {
      this.messages[channelId] = [];
    }

    // Add timestamp to message
    const messageWithTimestamp = {
      ...message,
      stored_at: new Date().toISOString(),
    };

    // Add to beginning of array (most recent first)
    this.messages[channelId].unshift(messageWithTimestamp);

    // Keep only last 100 messages per channel
    if (this.messages[channelId].length > 100) {
      this.messages[channelId] = this.messages[channelId].slice(0, 100);
    }

    this.saveMessages();
  }

  getChannelMessages(channelId) {
    return this.messages[channelId] || [];
  }
}

module.exports = MessageStore;
