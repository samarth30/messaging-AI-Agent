# Environment Configuration and Setup Guide

This document outlines the steps to configure and run the project with required and optional environment variables for API integration and functionality.

---

## Environment Variables

### For Twitter API v1 Support

Set the following environment variables in your `.env` file or environment configuration tool:

```plaintext
TWITTER_USERNAME=      # Twitter account username
TWITTER_PASSWORD=      # Twitter account password
TWITTER_EMAIL=         # Twitter account email
TWITTER_COOKIES=       # Twitter session cookies
```

### For Twitter API v2 Support

For using Twitter API v2, configure these environment variables:

```plaintext
TWITTER_API_KEY=key                    # Twitter API key
TWITTER_API_SECRET_KEY=secret          # Twitter API secret key
TWITTER_ACCESS_TOKEN=token             # Twitter access token
TWITTER_ACCESS_TOKEN_SECRET=tokensecret # Twitter access token secret
```

### Optional Variables

The following optional variables can be used to enhance functionality:

```plaintext
PROXY_URL=                             # HTTP(s) proxy for requests

OPENAI_API_KEY=                        # OpenAI API key for integration

DISCORD_USER_TOKEN=                    # Discord user token
DISCORD_USER_NAME=                     # Discord username
DISCORD_COOKIES=                       # Discord session cookies
```

---

## Setup Instructions

### Prerequisites

1. Ensure you have [Node.js](https://nodejs.org/) installed on your system.
2. Clone the repository and navigate to the project directory.

### Steps to Setup

1. Install the required dependencies by running:
   ```bash
   npm install
   ```
2. Create a `.env` file in the root directory and populate it with the environment variables listed above.

---

## Running the Project

### Running Discord Integration

To run the Discord integration, use the following command:

```bash
node src/discord.js --characters=src/characters/shaw.character.json
```

### Running Twitter Integration

To run the Twitter integration, use this command:

```bash
node src/twitter.js --characters=src/characters/shaw.character.json
```

---

## Notes

- Ensure that the `.env` file is properly configured before running any commands.
- The `shaw.character.json` file should contain the configuration for the characters used in the integration. Replace this file path with your desired character configuration if needed.
- Use a valid proxy URL if you encounter network restrictions or need to route traffic through a proxy.

---

## Troubleshooting

- If you encounter errors related to missing credentials, verify that all required environment variables are correctly set.
- Ensure that the Node.js version installed is compatible with the project dependencies.
- For any API-related issues, refer to the respective API documentation:
  - [Twitter API Documentation](https://developer.twitter.com/en/docs)
  - [OpenAI API Documentation](https://platform.openai.com/docs)
  - Discord API Documentation

---

## Contributing

If you would like to contribute to this project, feel free to submit a pull request or report issues in the repository.

---

## License

This project is licensed under the MIT License. See the LICENSE file for details.
