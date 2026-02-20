/**
 * Parser for GitHub Copilot conversation logs
 * Reads JSONL event stream and extracts exchanges
 */

import * as fs from 'fs';
import * as readline from 'readline';
import { randomUUID } from 'crypto';
import {
  Conversation,
  Exchange,
  CopilotEvent,
  ParsedConversation,
} from '../types';

export async function parseCopilotConversation(
  filePath: string
): Promise<ParsedConversation> {
  const events: CopilotEvent[] = [];
  
  // Read JSONL file line by line
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const event = JSON.parse(line) as CopilotEvent;
        events.push(event);
      } catch (err) {
        // Skip malformed JSON
        console.warn(`Skipping malformed JSON in ${filePath}: ${line}`);
      }
    }
  }

  // Extract session metadata
  const sessionStart = events.find(e => e.type === 'session.start');
  if (!sessionStart) {
    throw new Error(`No session.start event found in ${filePath}`);
  }

  const sessionId = sessionStart.data.sessionId;
  const copilotVersion = sessionStart.data.copilotVersion;
  const timestamp = sessionStart.timestamp;

  // Extract exchanges from events
  const exchanges = extractExchanges(events);

  const conversation: Conversation = {
    id: sessionId,
    source: 'copilot',
    sessionId,
    timestamp,
    archivePath: filePath,
    exchangeCount: exchanges.length,
    copilotVersion,
  };

  return { conversation, exchanges };
}

function extractExchanges(events: CopilotEvent[]): Exchange[] {
  const exchanges: Exchange[] = [];
  
  // Group events into exchanges
  let currentExchange: Partial<Exchange> | null = null;
  let exchangeIndex = 0;

  for (const event of events) {
    switch (event.type) {
      case 'user.message':
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
          exchangeIndex,
          timestamp: event.timestamp,
          userMessage: event.data.content || '',
          assistantMessage: '',
          toolCalls: [],
          parentId: event.parentId || undefined,
        };
        break;

      case 'assistant.message':
        if (currentExchange) {
          const content = event.data.content || '';
          
          // Append to assistant message (may be multiple assistant messages)
          if (currentExchange.assistantMessage) {
            currentExchange.assistantMessage += '\n' + content;
          } else {
            currentExchange.assistantMessage = content;
          }

          // Track tool requests
          if (event.data.toolRequests && event.data.toolRequests.length > 0) {
            const toolNames = event.data.toolRequests
              .map((tr: any) => tr.name || tr.tool)
              .filter(Boolean);
            currentExchange.toolCalls = [
              ...(currentExchange.toolCalls || []),
              ...toolNames,
            ];
          }
        }
        break;

      case 'tool.call':
      case 'tool.invoke':
        if (currentExchange && event.data.name) {
          currentExchange.toolCalls = [
            ...(currentExchange.toolCalls || []),
            event.data.name,
          ];
        }
        break;

      default:
        // Skip other event types
        break;
    }
  }

  // Save the last exchange
  if (currentExchange && currentExchange.userMessage && currentExchange.assistantMessage) {
    exchanges.push(currentExchange as Exchange);
  }

  // Set conversation ID for all exchanges
  const sessionId = events.find(e => e.type === 'session.start')?.data.sessionId || 'unknown';
  exchanges.forEach(ex => {
    (ex as any).conversationId = sessionId;
  });

  return exchanges;
}
