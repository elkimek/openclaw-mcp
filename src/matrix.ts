// Matrix HTTP API client — minimal, no SDK dependency

export interface MatrixMessage {
  sender: string;
  body: string;
  timestamp: number;
  eventId: string;
}

export class MatrixClient {
  private homeserver: string;
  private token: string;
  private syncToken: string | null = null;

  constructor(homeserver: string, token: string) {
    this.homeserver = homeserver.replace(/\/$/, '');
    this.token = token;
  }

  private async request(method: string, path: string, body?: object): Promise<any> {
    const url = `${this.homeserver}/_matrix/client/v3${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Matrix API error: ${data.errcode} - ${data.error}`);
    }
    return data;
  }

  async whoami(): Promise<{ userId: string }> {
    const data = await this.request('GET', '/account/whoami');
    return { userId: data.user_id };
  }

  async joinRoom(roomId: string): Promise<void> {
    await this.request('POST', `/join/${encodeURIComponent(roomId)}`, {});
  }

  async sendMessage(roomId: string, text: string, mention?: string): Promise<string> {
    const txnId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const body: any = { msgtype: 'm.text', body: text };

    if (mention) {
      body.body = `@${mention.replace('@', '').split(':')[0]} ${text}`;
      body.format = 'org.matrix.custom.html';
      body.formatted_body = `<a href="https://matrix.to/#/${mention}">${mention}</a> ${text}`;
    }

    const data = await this.request(
      'PUT',
      `/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
      body,
    );
    return data.event_id;
  }

  async getMessages(roomId: string, limit: number = 20, since?: string): Promise<MatrixMessage[]> {
    const params = new URLSearchParams({
      dir: 'b',
      limit: String(limit),
      ...(since ? { from: since } : {}),
    });
    const data = await this.request(
      'GET',
      `/rooms/${encodeURIComponent(roomId)}/messages?${params}`,
    );
    const messages: MatrixMessage[] = [];
    for (const event of data.chunk ?? []) {
      if (event.type === 'm.room.message' && event.content?.msgtype === 'm.text') {
        messages.push({
          sender: event.sender,
          body: event.content.body,
          timestamp: event.origin_server_ts,
          eventId: event.event_id,
        });
      }
    }
    return messages.reverse(); // chronological order
  }

  async getNewMessages(roomId: string, myUserId: string, afterEventId?: string, timeoutMs: number = 15000): Promise<MatrixMessage[]> {
    // Get recent messages and filter to ones after our last sent message
    const messages = await this.getMessages(roomId, 20);

    if (!afterEventId) {
      // Return last few messages from others
      return messages.filter(m => m.sender !== myUserId).slice(-5);
    }

    // Find our message and return everything after it from others
    const idx = messages.findIndex(m => m.eventId === afterEventId);
    if (idx === -1) return messages.filter(m => m.sender !== myUserId).slice(-5);

    const after = messages.slice(idx + 1).filter(m => m.sender !== myUserId);
    if (after.length > 0) return after;

    // No reply yet — poll briefly
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 2000));
      const fresh = await this.getMessages(roomId, 20);
      const freshIdx = fresh.findIndex(m => m.eventId === afterEventId);
      if (freshIdx === -1) continue;
      const replies = fresh.slice(freshIdx + 1).filter(m => m.sender !== myUserId);
      if (replies.length > 0) return replies;
    }

    return [];
  }
}
