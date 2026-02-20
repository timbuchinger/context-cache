/**
 * Parser for OpenCode conversation logs
 * Reads from OpenCode SQLite database
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  Conversation,
  Exchange,
  ParsedConversation,
} from '../types';

interface OpencodeSession {
  id: string;
  title: string;
  version: string;
  directory: string;
  time_created: number;
  time_updated: number;
}

interface OpencodeMessage {
  id: string;
  session_id: string;
  time_created: number;
  data: string;
}

interface OpencodeMessageData {
  role: 'user' | 'assistant' | 'system';
  time: { created: number };
  parentID?: string | null;
  finish?: string;
}

interface OpencodePart {
  id: string;
  message_id: string;
  data: string;
}

interface OpencodePartData {
  type: string;
  text?: string;
  tool?: string;
}

export async function parseOpencodeConversation(
  dbPath: string,
  sessionId: string
): Promise<ParsedConversation> {
  const db = new Database(dbPath, { readonly: true });

  try {
    // Get session metadata
    const session = db
      .prepare('SELECT * FROM session WHERE id = ?')
      .get(sessionId) as OpencodeSession | undefined;

    if (!session) {
      throw new Error(`Session ${sessionId} not found in ${dbPath}`);
    }

    // Get all messages for this session
    const messages = db
      .prepare('SELECT * FROM message WHERE session_id = ? ORDER BY time_created')
      .all(sessionId) as OpencodeMessage[];

    // Get all parts for these messages
    const messageIds = messages.map((m) => m.id);
    const parts: Record<string, OpencodePart[]> = {};

    if (messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(',');
      const allParts = db
        .prepare(`SELECT * FROM part WHERE message_id IN (${placeholders}) ORDER BY time_created`)
        .all(...messageIds) as OpencodePart[];

      for (const part of allParts) {
        if (!parts[part.message_id]) {
          parts[part.message_id] = [];
        }
        parts[part.message_id].push(part);
      }
    }

    // Extract exchanges
    const exchanges = extractExchanges(messages, parts, sessionId);

    const conversation: Conversation = {
      id: sessionId,
      source: 'opencode',
      sessionId: sessionId,
      timestamp: new Date(session.time_created).toISOString(),
      archivePath: dbPath,
      exchangeCount: exchanges.length,
    };

    return { conversation, exchanges };
  } finally {
    db.close();
  }
}

function extractExchanges(
  messages: OpencodeMessage[],
  parts: Record<string, OpencodePart[]>,
  sessionId: string
): Exchange[] {
  const exchanges: Exchange[] = [];
  let currentExchange: Partial<Exchange> | null = null;
  let exchangeIndex = 0;

  for (const message of messages) {
    const messageData: OpencodeMessageData = JSON.parse(message.data);
    const messageParts = parts[message.id] || [];

    switch (messageData.role) {
      case 'user':
        // Start a new exchange
        if (currentExchange && currentExchange.userMessage) {
          // Save previous exchange if it has assistant response
          if (currentExchange.assistantMessage) {
            exchanges.push(currentExchange as Exchange);
            exchangeIndex++;
          }
        }

        currentExchange = {
          id: randomUUID(),
          conversationId: sessionId,
          exchangeIndex,
          timestamp: new Date(messageData.time.created).toISOString(),
          userMessage: extractTextFromParts(messageParts),
          assistantMessage: '',
          toolCalls: [],
          parentId: messageData.parentID || undefined,
        };
        break;

      case 'assistant':
        if (currentExchange) {
          const text = extractTextFromParts(messageParts);
          
          // Extract tool calls from parts
          const toolCalls = extractToolCallsFromParts(messageParts);
          
          // If we have tool calls, this is a valid assistant response even without text
          if (text || toolCalls.length > 0) {
            currentExchange.assistantMessage = text || ''; // Empty string if only tools
            
            if (toolCalls.length > 0) {
              currentExchange.toolCalls = [
                ...(currentExchange.toolCalls || []),
                ...toolCalls,
              ];
            }
          }
        }
        break;

      default:
        // Skip system messages and other types
        break;
    }
  }

  // Save the last exchange
  if (
    currentExchange &&
    currentExchange.userMessage &&
    (currentExchange.assistantMessage || (currentExchange.toolCalls && currentExchange.toolCalls.length > 0))
  ) {
    exchanges.push(currentExchange as Exchange);
  }

  return exchanges;
}

function extractTextFromParts(parts: OpencodePart[]): string {
  return parts
    .map((part) => {
      const partData: OpencodePartData = JSON.parse(part.data);
      if (partData.type === 'text' && partData.text) {
        return partData.text;
      }
      return '';
    })
    .join('');
}

function extractToolCallsFromParts(parts: OpencodePart[]): string[] {
  const tools: string[] = [];
  
  for (const part of parts) {
    const partData: OpencodePartData = JSON.parse(part.data);
    if (partData.type === 'tool-call' && partData.tool) {
      tools.push(partData.tool);
    }
  }
  
  return tools;
}
