/**
 * Display full conversations
 */

import Database from 'better-sqlite3';
import { getConversation, getExchanges } from './indexer';
import * as fs from 'fs';

export interface ShowOptions {
  startLine?: number;
  endLine?: number;
}

export function showConversation(
  db: Database.Database,
  conversationId: string,
  options: ShowOptions = {}
): string {
  const conversation = getConversation(db, conversationId);
  
  if (!conversation) {
    return `Conversation not found: ${conversationId}`;
  }
  
  const exchanges = getExchanges(db, conversationId);
  
  let output = `# Conversation: ${conversation.sessionId}\n\n`;
  output += `**Source:** ${conversation.source}\n`;
  output += `**Date:** ${new Date(conversation.timestamp).toLocaleString()}\n`;
  output += `**Exchanges:** ${conversation.exchangeCount}\n`;
  if (conversation.copilotVersion) {
    output += `**Version:** ${conversation.copilotVersion}\n`;
  }
  output += '\n---\n\n';
  
  const startIdx = options.startLine ? options.startLine - 1 : 0;
  const endIdx = options.endLine ? options.endLine : exchanges.length;
  const selectedExchanges = exchanges.slice(startIdx, endIdx);
  
  for (const exchange of selectedExchanges) {
    const time = new Date(exchange.timestamp).toLocaleTimeString();
    
    output += `## Exchange ${exchange.exchangeIndex + 1} (${time})\n\n`;
    
    output += `**User:**\n`;
    output += exchange.userMessage;
    output += '\n\n';
    
    output += `**Assistant:**\n`;
    output += exchange.assistantMessage;
    output += '\n\n';
    
    if (exchange.toolCalls && exchange.toolCalls.length > 0) {
      output += `**Tools used:** ${exchange.toolCalls.join(', ')}\n\n`;
    }
    
    output += '---\n\n';
  }
  
  if (options.startLine || options.endLine) {
    output += `\n*Showing exchanges ${startIdx + 1}-${endIdx} of ${exchanges.length}*\n`;
  }
  
  return output;
}

export function showConversationByPath(
  path: string,
  options: ShowOptions = {}
): string {
  if (!fs.existsSync(path)) {
    return `File not found: ${path}`;
  }
  
  // Read the JSONL file directly
  const content = fs.readFileSync(path, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  let output = `# Conversation from ${path}\n\n`;
  
  // Parse session info
  const sessionLine = lines.find(line => line.includes('"type":"session.start"'));
  if (sessionLine) {
    try {
      const session = JSON.parse(sessionLine);
      output += `**Session ID:** ${session.data?.sessionId || 'unknown'}\n`;
      output += `**Started:** ${session.timestamp || 'unknown'}\n`;
      output += '\n---\n\n';
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  // Extract user/assistant exchanges
  const events = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch (e) {
      return null;
    }
  }).filter(e => e !== null);
  
  const userMessages = events.filter(e => e.type === 'user.message');
  const assistantMessages = events.filter(e => e.type === 'assistant.message');
  
  const startIdx = options.startLine ? options.startLine - 1 : 0;
  const endIdx = options.endLine ? options.endLine : Math.min(userMessages.length, assistantMessages.length);
  
  for (let i = startIdx; i < endIdx; i++) {
    if (userMessages[i] && assistantMessages[i]) {
      const userTime = new Date(userMessages[i].timestamp).toLocaleTimeString();
      
      output += `## Exchange ${i + 1} (${userTime})\n\n`;
      
      output += `**User:**\n`;
      output += userMessages[i].data?.content || userMessages[i].data?.transformedContent || '(no content)';
      output += '\n\n';
      
      output += `**Assistant:**\n`;
      output += assistantMessages[i].data?.content || '(no content)';
      output += '\n\n';
      
      output += '---\n\n';
    }
  }
  
  if (options.startLine || options.endLine) {
    const total = Math.min(userMessages.length, assistantMessages.length);
    output += `\n*Showing exchanges ${startIdx + 1}-${endIdx} of ${total}*\n`;
  }
  
  return output;
}
