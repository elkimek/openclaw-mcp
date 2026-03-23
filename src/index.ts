#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MatrixClient } from './matrix.js';

// Config from environment
const MATRIX_TOKEN = process.env.OPENCLAW_MATRIX_TOKEN;
const MATRIX_HOMESERVER = process.env.OPENCLAW_MATRIX_HOMESERVER || 'https://matrix.org';
const MATRIX_ROOM = process.env.OPENCLAW_MATRIX_ROOM;
const BOT_USER_ID = process.env.OPENCLAW_BOT_USER_ID; // e.g. @zofka:matrix.org

if (!MATRIX_TOKEN || !MATRIX_ROOM || !BOT_USER_ID) {
  console.error('Required environment variables:');
  console.error('  OPENCLAW_MATRIX_TOKEN  - Matrix access token');
  console.error('  OPENCLAW_MATRIX_ROOM   - Room ID (e.g. !abc123:matrix.org)');
  console.error('  OPENCLAW_BOT_USER_ID   - Bot user ID (e.g. @zofka:matrix.org)');
  console.error('Optional:');
  console.error('  OPENCLAW_MATRIX_HOMESERVER - Default: https://matrix.org');
  process.exit(1);
}

const matrix = new MatrixClient(MATRIX_HOMESERVER, MATRIX_TOKEN);
let myUserId: string;
let lastSentEventId: string | undefined;

const server = new McpServer({
  name: 'openclaw-mcp',
  version: '0.1.0',
});

server.tool(
  'openclaw_send',
  `Send a message to your OpenClaw bot. The bot will see this in the shared Matrix room and respond.`,
  { message: z.string().describe('Message to send to the bot') },
  async ({ message }) => {
    try {
      const eventId = await matrix.sendMessage(MATRIX_ROOM!, message, BOT_USER_ID!);
      lastSentEventId = eventId;

      // Wait for reply
      const replies = await matrix.getNewMessages(
        MATRIX_ROOM!,
        myUserId,
        eventId,
        30000,
      );

      if (replies.length === 0) {
        return { content: [{ type: 'text', text: 'Message sent but no reply yet. Use openclaw_read to check later.' }] };
      }

      const text = replies.map(r => r.body).join('\n\n');
      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  'openclaw_read',
  'Read recent messages from the OpenClaw bot in the shared Matrix room.',
  {
    limit: z.number().optional().default(10).describe('Number of recent messages to fetch'),
  },
  async ({ limit }) => {
    try {
      const messages = await matrix.getMessages(MATRIX_ROOM!, limit);
      if (messages.length === 0) {
        return { content: [{ type: 'text', text: 'No messages in room.' }] };
      }

      const formatted = messages.map(m => {
        const name = m.sender === myUserId ? 'You' : m.sender === BOT_USER_ID ? 'Bot' : m.sender;
        const time = new Date(m.timestamp).toLocaleTimeString();
        return `[${time}] ${name}: ${m.body}`;
      }).join('\n\n');

      return { content: [{ type: 'text', text: formatted }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

async function main() {
  // Verify connection
  const whoami = await matrix.whoami();
  myUserId = whoami.userId;

  // Ensure we're in the room
  try {
    await matrix.joinRoom(MATRIX_ROOM!);
  } catch {
    // Already joined, that's fine
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
