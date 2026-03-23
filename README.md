# openclaw-mcp

A [Claude Code](https://claude.ai/code) MCP server that lets you talk to your [OpenClaw](https://openclaw.ai) bot through Matrix.

## How it works

```
Claude Code (your terminal)
  └── MCP server (this package)
        └── Matrix API
              └── Your shared Matrix room
                    └── OpenClaw bot reads and replies
```

Claude Code gets two tools:
- **`openclaw_send`** — send a message to your bot and wait for the reply
- **`openclaw_read`** — read recent messages from the room

## Setup

### 1. Prerequisites

- An [OpenClaw](https://openclaw.ai) instance with Matrix channel enabled
- A Matrix account for Claude Code (e.g. create `@yourclaude:matrix.org` on [Element](https://app.element.io))
- A Matrix room with both your bot and the Claude Code account invited

### 2. Install

```bash
npm install -g openclaw-mcp
```

Or clone and build:

```bash
git clone https://github.com/elkimek/openclaw-mcp.git
cd openclaw-mcp
npm install && npm run build
```

### 3. Configure Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "openclaw": {
      "command": "openclaw-mcp",
      "env": {
        "OPENCLAW_MATRIX_TOKEN": "your-matrix-access-token",
        "OPENCLAW_MATRIX_ROOM": "!roomid:matrix.org",
        "OPENCLAW_BOT_USER_ID": "@yourbot:matrix.org"
      }
    }
  }
}
```

If installed from source, use the full path:

```json
{
  "mcpServers": {
    "openclaw": {
      "command": "node",
      "args": ["/path/to/openclaw-mcp/dist/index.js"],
      "env": {
        "OPENCLAW_MATRIX_TOKEN": "your-matrix-access-token",
        "OPENCLAW_MATRIX_ROOM": "!roomid:matrix.org",
        "OPENCLAW_BOT_USER_ID": "@yourbot:matrix.org"
      }
    }
  }
}
```

### 4. Get your Matrix access token

In Element: **Settings > Help & About > Access Token** (at the bottom).

### 5. Find your room ID

In Element: **Room Settings > Advanced > Internal room ID**.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENCLAW_MATRIX_TOKEN` | Yes | Matrix access token for the Claude Code account |
| `OPENCLAW_MATRIX_ROOM` | Yes | Matrix room ID (e.g. `!abc123:matrix.org`) |
| `OPENCLAW_BOT_USER_ID` | Yes | Your OpenClaw bot's Matrix user ID (e.g. `@zofka:matrix.org`) |
| `OPENCLAW_MATRIX_HOMESERVER` | No | Matrix homeserver URL (default: `https://matrix.org`) |

## Usage

Once configured, just talk naturally in Claude Code:

> "Ask my OpenClaw bot what my vitamin D levels are"
> "Message Žofka about my latest lab results"
> "Read the last messages from my bot"

## Note on encryption

This MCP server uses the Matrix HTTP API directly without E2E encryption support. Make sure your room has encryption **disabled**, or the bot won't be able to read messages sent through this bridge.

## License

GPL-3.0
