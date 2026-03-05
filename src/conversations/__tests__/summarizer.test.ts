import * as path from 'path';
import {
  formatConversationText,
  chunkExchanges,
  extractSummary,
  renderPrompt,
  summarizeConversation,
  parseRetryAfter,
  calcBackoffMs,
  SummarizeOptions,
} from '../summarizer';
import { Exchange } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeExchange = (i: number, overrides: Partial<Exchange> = {}): Exchange => ({
  id: `ex-${i}`,
  conversationId: 'conv-1',
  exchangeIndex: i,
  timestamp: '2026-01-01T00:00:00Z',
  userMessage: `Question ${i}`,
  assistantMessage: `Answer ${i}`,
  ...overrides,
});

const PROMPTS_DIR = path.join(__dirname, '../../../prompts');

const mockOptions: SummarizeOptions = {
  apiUrl: 'http://mock-api',
  apiKey: 'test-key',
  model: 'test-model',
  promptsDir: PROMPTS_DIR,
};

// ---------------------------------------------------------------------------
// formatConversationText
// ---------------------------------------------------------------------------

describe('formatConversationText', () => {
  test('formats exchanges as User/Assistant pairs separated by ---', () => {
    const exchanges = [makeExchange(0), makeExchange(1)];
    const text = formatConversationText(exchanges);

    expect(text).toContain('User: Question 0');
    expect(text).toContain('Assistant: Answer 0');
    expect(text).toContain('---');
    expect(text).toContain('User: Question 1');
    expect(text).toContain('Assistant: Answer 1');
  });

  test('includes tool calls when present', () => {
    const exchange = makeExchange(0, { toolCalls: ['read_file', 'write_file'] });
    const text = formatConversationText([exchange]);
    expect(text).toContain('Tools: read_file, write_file');
  });

  test('omits Tools line when no tool calls', () => {
    const text = formatConversationText([makeExchange(0)]);
    expect(text).not.toContain('Tools:');
  });

  test('returns empty string for empty array', () => {
    expect(formatConversationText([])).toBe('');
  });
});

// ---------------------------------------------------------------------------
// chunkExchanges
// ---------------------------------------------------------------------------

describe('chunkExchanges', () => {
  test('splits into chunks of default size 8', () => {
    const exchanges = Array.from({ length: 20 }, (_, i) => makeExchange(i));
    const chunks = chunkExchanges(exchanges);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(8);
    expect(chunks[1]).toHaveLength(8);
    expect(chunks[2]).toHaveLength(4);
  });

  test('respects custom chunk size', () => {
    const exchanges = Array.from({ length: 10 }, (_, i) => makeExchange(i));
    const chunks = chunkExchanges(exchanges, 3);
    expect(chunks).toHaveLength(4);
  });

  test('handles fewer exchanges than chunk size', () => {
    const exchanges = [makeExchange(0), makeExchange(1)];
    const chunks = chunkExchanges(exchanges, 8);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(2);
  });

  test('handles empty array', () => {
    expect(chunkExchanges([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractSummary
// ---------------------------------------------------------------------------

describe('extractSummary', () => {
  test('extracts text from <summary> tags', () => {
    const result = extractSummary('Some text <summary>The summary content</summary> more text');
    expect(result).toBe('The summary content');
  });

  test('trims whitespace from extracted summary', () => {
    const result = extractSummary('<summary>  \n  content  \n  </summary>');
    expect(result).toBe('content');
  });

  test('returns empty string when no tags found', () => {
    const result = extractSummary('no tags here');
    expect(result).toBe('');
  });

  test('handles multiline summaries', () => {
    const result = extractSummary('<summary>line one\nline two</summary>');
    expect(result).toBe('line one\nline two');
  });
});

// ---------------------------------------------------------------------------
// renderPrompt
// ---------------------------------------------------------------------------

describe('renderPrompt', () => {
  test('replaces {{variable}} placeholders', () => {
    const result = renderPrompt('Hello {{name}}, you are {{age}} years old', {
      name: 'Alice',
      age: '30',
    });
    expect(result).toBe('Hello Alice, you are 30 years old');
  });

  test('replaces all occurrences of a variable', () => {
    const result = renderPrompt('{{x}} and {{x}}', { x: 'foo' });
    expect(result).toBe('foo and foo');
  });

  test('leaves unknown placeholders unchanged', () => {
    const result = renderPrompt('{{known}} and {{unknown}}', { known: 'yes' });
    expect(result).toBe('yes and {{unknown}}');
  });
});

// ---------------------------------------------------------------------------
// summarizeConversation
// ---------------------------------------------------------------------------

describe('summarizeConversation', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns empty string when apiUrl is not configured', async () => {
    const result = await summarizeConversation([makeExchange(0)], {
      ...mockOptions,
      apiUrl: '',
    });
    expect(result).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('returns empty string when model is not configured', async () => {
    const result = await summarizeConversation([makeExchange(0)], {
      ...mockOptions,
      model: '',
    });
    expect(result).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('returns empty string for empty exchanges array', async () => {
    const result = await summarizeConversation([], mockOptions);
    expect(result).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('calls API once for short conversations and extracts summary', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '<summary>Built JWT auth.</summary>' } }],
      }),
    });

    const exchanges = Array.from({ length: 3 }, (_, i) => makeExchange(i));
    const result = await summarizeConversation(exchanges, mockOptions);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toBe('Built JWT auth.');
  });

  test('sends correct Authorization header', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '<summary>Test.</summary>' } }],
      }),
    });

    await summarizeConversation([makeExchange(0)], mockOptions);

    const [_url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer test-key');
  });

  test('uses hierarchical summarization for long conversations (>15 exchanges)', async () => {
    // 20 exchanges → ceil(20/8)=3 chunks + 1 synthesis = 4 calls
    const chunkResp = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '<summary>Chunk summary.</summary>' } }],
      }),
    };
    const synthResp = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '<summary>Final summary.</summary>' } }],
      }),
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(chunkResp)
      .mockResolvedValueOnce(chunkResp)
      .mockResolvedValueOnce(chunkResp)
      .mockResolvedValueOnce(synthResp);

    const exchanges = Array.from({ length: 20 }, (_, i) => makeExchange(i));
    const result = await summarizeConversation(exchanges, mockOptions);

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result).toBe('Final summary.');
  });

  test('returns empty string and logs warning when API call fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await summarizeConversation([makeExchange(0)], mockOptions);

    expect(result).toBe('');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Summarization failed')
    );
  });

  test('returns fallback text when response has no <summary> tags', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Plain text summary without tags.' } }],
      }),
    });

    const result = await summarizeConversation([makeExchange(0)], mockOptions);
    expect(result).toBe('Plain text summary without tags.');
  });

  test('retries on 429 and succeeds on second attempt', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: async () => 'rate limited',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '<summary>Retry succeeded.</summary>' } }],
        }),
      });

    const result = await summarizeConversation(
      [makeExchange(0)],
      { ...mockOptions, maxRetries: 2, baseDelayMs: 0 }
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toBe('Retry succeeded.');
  });

  test('respects Retry-After header on 429', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (h: string) => h === 'Retry-After' ? '1' : null },
        text: async () => 'rate limited',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '<summary>Success after retry-after.</summary>' } }],
        }),
      });

    const result = await summarizeConversation(
      [makeExchange(0)],
      { ...mockOptions, maxRetries: 2, baseDelayMs: 0 }
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toBe('Success after retry-after.');
  });

  test('gives up after maxRetries exhausted and returns empty string', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
      text: async () => 'rate limited',
    });

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await summarizeConversation(
      [makeExchange(0)],
      { ...mockOptions, maxRetries: 2, baseDelayMs: 0 }
    );

    expect(result).toBe('');
    expect(fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Summarization failed')
    );
  });

  test('retries on 503 transient error', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => null },
        text: async () => 'Service Unavailable',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '<summary>503 retry success.</summary>' } }],
        }),
      });

    const result = await summarizeConversation(
      [makeExchange(0)],
      { ...mockOptions, maxRetries: 2, baseDelayMs: 0 }
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toBe('503 retry success.');
  });

  test('does NOT retry on non-retryable 500 error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await summarizeConversation(
      [makeExchange(0)],
      { ...mockOptions, maxRetries: 3, baseDelayMs: 0 }
    );

    expect(result).toBe('');
    expect(fetch).toHaveBeenCalledTimes(1); // no retries
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Summarization failed')
    );
  });
});

// ---------------------------------------------------------------------------
// parseRetryAfter
// ---------------------------------------------------------------------------

describe('parseRetryAfter', () => {
  test('parses integer seconds string to milliseconds', () => {
    expect(parseRetryAfter('60')).toBe(60000);
  });

  test('parses "0" to 0 ms', () => {
    expect(parseRetryAfter('0')).toBe(0);
  });

  test('returns null for null input', () => {
    expect(parseRetryAfter(null)).toBeNull();
  });

  test('returns null for non-numeric non-date string', () => {
    expect(parseRetryAfter('invalid')).toBeNull();
  });

  test('parses HTTP date string to future milliseconds', () => {
    const futureDate = new Date(Date.now() + 5000);
    const result = parseRetryAfter(futureDate.toUTCString());
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
    expect(result!).toBeLessThanOrEqual(6000);
  });
});

// ---------------------------------------------------------------------------
// calcBackoffMs
// ---------------------------------------------------------------------------

describe('calcBackoffMs', () => {
  test('returns 0 when baseDelayMs is 0', () => {
    expect(calcBackoffMs(3, 0, 60000)).toBe(0);
  });

  test('caps at maxDelayMs', () => {
    const result = calcBackoffMs(20, 1000, 5000);
    expect(result).toBeLessThanOrEqual(5000);
  });

  test('returns a non-negative value', () => {
    const result = calcBackoffMs(0, 1000, 60000);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  test('grows with attempt number (base delay doubles per attempt)', () => {
    // With no jitter (baseDelayMs=1000), attempt 2 gives 4000 base before jitter
    // We just verify it doesn't decrease beyond a floor
    const a0 = calcBackoffMs(0, 1000, 60000);
    const a2 = calcBackoffMs(2, 1000, 60000);
    // attempt=0 → ~1000ms, attempt=2 → ~4000ms (both have jitter, so just test a2 > 500)
    expect(a2).toBeGreaterThan(a0);
  });
});
