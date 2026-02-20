/**
 * Types for conversation indexing and search
 */

export type ConversationSource = 'copilot' | 'claude' | 'cursor' | 'opencode';

export interface Conversation {
  id: string;
  source: ConversationSource;
  sessionId: string;
  timestamp: string;
  archivePath: string;
  exchangeCount: number;
  lastIndexed?: number;
  copilotVersion?: string;
  cwd?: string;
}

export interface Exchange {
  id: string;
  conversationId: string;
  exchangeIndex: number;
  timestamp: string;
  userMessage: string;
  assistantMessage: string;
  toolCalls?: string[];
  parentId?: string;
}

// GitHub Copilot event types
export interface CopilotEvent {
  type: string;
  data: any;
  id: string;
  timestamp: string;
  parentId: string | null;
}

export interface CopilotSessionStart {
  sessionId: string;
  version: number;
  producer: string;
  copilotVersion: string;
  startTime: string;
}

export interface CopilotUserMessage {
  content: string;
  transformedContent?: string;
  attachments?: any[];
}

export interface CopilotAssistantMessage {
  messageId?: string;
  content: string;
  toolRequests?: any[];
}

export interface ParsedConversation {
  conversation: Conversation;
  exchanges: Exchange[];
}
