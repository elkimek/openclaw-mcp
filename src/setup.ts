#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stderr });

function ask(question: string, defaultVal?: string): Promise<string> {
  const suffix = defaultVal ? ` [${defaultVal}]` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

async function verifyToken(homeserver: string, token: string): Promise<string> {
  const res = await fetch(`${homeserver}/_matrix/client/v3/account/whoami`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Token verification failed: ${(data as any).error || res.statusText}`);
  }
  const data = await res.json();
  return (data as any).user_id;
}

async function verifyRoom(homeserver: string, token: string, roomId: string): Promise<void> {
  // Try joining — works if already a member
  const res = await fetch(`${homeserver}/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Cannot join room ${roomId}: ${(data as any).error || res.statusText}`);
  }
}

function findBinaryPath(): string {
  // Check if globally installed
  const globalBin = process.argv[1]?.replace(/\/setup\.js$/, '/index.js');
  if (globalBin && fs.existsSync(globalBin)) {
    // Return the bin name if it's in a global node_modules
    if (globalBin.includes('node_modules')) {
      return 'openclaw-mcp';
    }
  }

  // Fall back to the dist path relative to package root
  const distIndex = path.resolve(import.meta.dirname, 'index.js');
  if (fs.existsSync(distIndex)) {
    return `node ${distIndex}`;
  }

  return 'openclaw-mcp';
}

async function main() {
  console.error('\n  openclaw-mcp setup\n');

  // 1. Collect credentials
  const homeserver = await ask('Matrix homeserver URL', 'https://matrix.org');
  const token = await ask('Matrix access token (Element: Settings > Help & About > Access Token)');
  if (!token) {
    console.error('Error: access token is required.');
    process.exit(1);
  }

  // 2. Verify token
  console.error('\nVerifying token...');
  let userId: string;
  try {
    userId = await verifyToken(homeserver, token);
    console.error(`  Authenticated as ${userId}`);
  } catch (e: any) {
    console.error(`  ${e.message}`);
    process.exit(1);
  }

  // 3. Get room and bot info
  const roomId = await ask('Room ID (Element: Room Settings > Advanced > Internal room ID)');
  if (!roomId) {
    console.error('Error: room ID is required.');
    process.exit(1);
  }

  // 4. Verify room membership
  console.error('Verifying room access...');
  try {
    await verifyRoom(homeserver, token, roomId);
    console.error('  Room OK');
  } catch (e: any) {
    console.error(`  ${e.message}`);
    process.exit(1);
  }

  const botUserId = await ask('OpenClaw bot user ID (e.g. @zofka:matrix.org)');
  if (!botUserId) {
    console.error('Error: bot user ID is required.');
    process.exit(1);
  }

  // 5. Determine command path
  const cmd = findBinaryPath();
  const useNodeWrapper = cmd.startsWith('node ');

  // 6. Build MCP config
  const env: Record<string, string> = {
    OPENCLAW_MATRIX_TOKEN: token,
    OPENCLAW_MATRIX_ROOM: roomId,
    OPENCLAW_BOT_USER_ID: botUserId,
  };
  if (homeserver !== 'https://matrix.org') {
    env.OPENCLAW_MATRIX_HOMESERVER = homeserver;
  }

  const mcpEntry: Record<string, any> = { env };
  if (useNodeWrapper) {
    mcpEntry.command = 'node';
    mcpEntry.args = [cmd.replace('node ', '')];
  } else {
    mcpEntry.command = cmd;
  }

  // 7. Write to ~/.claude/settings.json
  const claudeDir = path.join(process.env.HOME || '~', '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  let settings: any = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      console.error(`Warning: could not parse ${settingsPath}, will overwrite.`);
    }
  } else {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }
  settings.mcpServers.openclaw = mcpEntry;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  console.error(`\nDone! Config written to ${settingsPath}`);
  console.error(`Authenticated as: ${userId}`);
  console.error(`Room: ${roomId}`);
  console.error(`Bot: ${botUserId}`);
  console.error('\nRestart Claude Code to activate the MCP server.');

  rl.close();
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  rl.close();
  process.exit(1);
});
