const fs = require("fs");
const path = require("path");

class BlacklistManager {
  constructor(platform) {
    this.platform = platform;
    this.blacklistFile = path.resolve(
      __dirname,
      `../../messages-local/${platform}-blacklist.json`
    );
    this.blacklist = this.loadBlacklist();
  }

  loadBlacklist() {
    try {
      if (!fs.existsSync(this.blacklistFile)) {
        // Create messages-local directory if it doesn't exist
        const dir = path.dirname(this.blacklistFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.blacklistFile, JSON.stringify({}));
        return {};
      }
      return JSON.parse(fs.readFileSync(this.blacklistFile, "utf8"));
    } catch (error) {
      console.error(`Error loading blacklist: ${error.message}`);
      return {};
    }
  }

  saveBlacklist() {
    try {
      fs.writeFileSync(
        this.blacklistFile,
        JSON.stringify(this.blacklist, null, 2)
      );
    } catch (error) {
      console.error(`Error saving blacklist: ${error.message}`);
    }
  }

  addToBlacklist(channelId, reason) {
    this.blacklist[channelId] = {
      timestamp: new Date().toISOString(),
      reason,
    };
    this.saveBlacklist();
  }

  isBlacklisted(channelId) {
    return !!this.blacklist[channelId];
  }
}

module.exports = BlacklistManager;
