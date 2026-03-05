/**
 * Summarize conversations using an OpenAI-compatible chat completions API.
 * Prompts are loaded from markdown files in the prompts/ directory so users
 * can edit them without touching code.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Exchange } from './types';

// Resolve prompts directory relative to this file's location.
// At runtime (dist/conversations/summarizer.js): ../../prompts → <root>/prompts
// During ts-jest tests (src/conversations/summarizer.ts): ../../prompts → <root>/prompts
const DEFAULT_PROMPTS_DIR = path.resolve(__dirname, '../../prompts');

export interface SummarizeOptions {
  apiUrl: string;
  apiKey: string;
  model: string;
  /** Override the directory to load prompt files from (useful in tests). */
  promptsDir?: string;
  /** Maximum number of retries on rate-limit / transient errors. Default: 3. */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default: 1000. Set to 0 in tests. */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default: 60000. */
  maxDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

export function getPromptsDir(promptsDir?: string): string {
  return promptsDir || process.env.SUMMARIZE_PROMPTS_DIR || DEFAULT_PROMPTS_DIR;
}

export function loadPrompt(filename: string, promptsDir?: string): string {
  const dir = getPromptsDir(promptsDir);
  const filePath = path.join(dir, filename);
  return fs.readFileSync(filePath, 'utf-8');
}

export function renderPrompt(
  template: string,
  vars: Record<string, string>
): string {
  return Object.entries(vars).reduce(
    (t, [key, value]) => t.split(`{{${key}}}`).join(value),
    template
  );
}

export function extractSummary(text: string): string {
  const m = text.match(/<summary>([\s\S]*?)<\/summary>/);
  return m ? m[1].trim() : '';
}

export function formatConversationText(exchanges: Exchange[]): string {
  if (exchanges.length === 0) return '';
  return exchanges
    .map(ex => {
      let block = `User: ${ex.userMessage}\n\nAssistant: ${ex.assistantMessage}`;
      if (ex.toolCalls && ex.toolCalls.length > 0) {
        block += `\n\nTools: ${ex.toolCalls.join(', ')}`;
      }
      return block;
    })
    .join('\n\n---\n\n');
}

export function chunkExchanges(
  exchanges: Exchange[],
  chunkSize = 8
): Exchange[][] {
  const chunks: Exchange[][] = [];
  for (let i = 0; i < exchanges.length; i += chunkSize) {
    chunks.push(exchanges.slice(i, i + chunkSize));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Retry helpers (exported for testing)
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

/**
 * Parse the value of a Retry-After HTTP header.
 * Accepts either an integer (seconds) or an HTTP date string.
 * Returns the delay in milliseconds, or null if the header is absent/invalid.
 */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  const date = new Date(header);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }
  return null;
}

/**
 * Calculate exponential backoff with up to 50% random jitter, capped at maxDelayMs.
 */
export function calcBackoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  if (baseDelayMs === 0) return 0;
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * exponential * 0.5;
  return Math.min(exponential + jitter, maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

async function callChatCompletion(
  prompt: string,
  options: SummarizeOptions
): Promise<string> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 60000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(`${options.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.3,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      return data.choices?.[0]?.message?.content ?? '';
    }

    const canRetry = RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxRetries;
    if (canRetry) {
      const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
      const delay = retryAfter ?? calcBackoffMs(attempt, baseDelayMs, maxDelayMs);
      if (delay > 0) await sleep(delay);
      continue;
    }

    const body = await response.text();
    throw new Error(`API error ${response.status}: ${body}`);
  }

  // Unreachable but satisfies TypeScript
  throw new Error('Max retries exhausted');
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generate a summary for a list of exchanges.
 *
 * Returns an empty string if:
 * - apiUrl or model is not configured
 * - exchanges is empty
 * - the API call fails (logs a warning)
 *
 * For ≤15 exchanges: single direct API call.
 * For >15 exchanges: hierarchical — chunk into groups of 8, summarize each,
 *   then synthesize chunk summaries into a final summary.
 */
export async function summarizeConversation(
  exchanges: Exchange[],
  options: SummarizeOptions
): Promise<string> {
  if (!options.apiUrl || !options.model) return '';
  if (exchanges.length === 0) return '';

  try {
    if (exchanges.length <= 15) {
      const template = loadPrompt('summarize-direct.md', options.promptsDir);
      const prompt = renderPrompt(template, {
        conversation: formatConversationText(exchanges),
      });
      const response = await callChatCompletion(prompt, options);
      return extractSummary(response) || response.trim();
    }

    // Hierarchical summarization
    const chunks = chunkExchanges(exchanges, 8);
    const chunkTemplate = loadPrompt('summarize-chunk.md', options.promptsDir);
    const chunkSummaries: string[] = [];

    for (const chunk of chunks) {
      const prompt = renderPrompt(chunkTemplate, {
        chunk: formatConversationText(chunk),
      });
      try {
        const response = await callChatCompletion(prompt, options);
        const summary = extractSummary(response) || response.trim();
        if (summary) chunkSummaries.push(summary);
      } catch {
        // Skip failed chunks — continue with what we have
      }
    }

    if (chunkSummaries.length === 0) return '';

    const synthesizeTemplate = loadPrompt(
      'summarize-synthesize.md',
      options.promptsDir
    );
    const synthesizePrompt = renderPrompt(synthesizeTemplate, {
      chunk_summaries: chunkSummaries
        .map((s, i) => `${i + 1}. ${s}`)
        .join('\n'),
    });
    const synthesized = await callChatCompletion(synthesizePrompt, options);
    return extractSummary(synthesized) || synthesized.trim();
  } catch (error) {
    console.warn(`⚠️  Summarization failed (skipping): ${error}`);
    return '';
  }
}
