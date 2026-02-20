/**
 * Compute hash of conversation content for change detection
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import { Conversation, Exchange } from './types';

export function computeConversationHash(data: { conversation: Conversation; exchanges: Exchange[] }): string {
  // Create a deterministic string representation of the conversation
  const conversationStr = JSON.stringify({
    id: data.conversation.id,
    session_id: data.conversation.sessionId,
    source: data.conversation.source,
    exchanges: data.exchanges.map(e => ({
      id: e.id,
      index: e.exchangeIndex,
      user_message: e.userMessage,
      assistant_message: e.assistantMessage,
    })),
  });

  return crypto.createHash('sha256').update(conversationStr).digest('hex');
}

export function computeConversationFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
}
