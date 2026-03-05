import * as os from 'os';
import * as path from 'path';
import { config as loadDotenv } from 'dotenv';

// Load .env from the repo root (or wherever the process is run from).
// Skipped in the test environment (Jest sets NODE_ENV=test) so that test
// isolation is not broken by credentials in a developer's .env file.
if (process.env.NODE_ENV !== 'test') {
  loadDotenv();
}

export interface Config {
  // Database
  databasePath: string;

  // Knowledge Base
  knowledgeBasePath: string;

  // Chunking
  chunkSize: number;
  chunkOverlap: number;

  // Embedding (Ollama-based)
  ollamaUrl: string;
  ollamaEmbedModel: string;

  // Search
  searchLimit: number;
  rrfK: number;

  // Summarization (OpenAI-compatible)
  summarizeApiUrl: string;
  summarizeApiKey: string;
  summarizeModel: string;
}

const DEFAULT_CONFIG: Config = {
  databasePath: path.join(os.homedir(), 'git/knowledge-base/db.sqlite'),
  knowledgeBasePath: path.join(os.homedir(), 'git/knowledge-base'),
  chunkSize: 500,
  chunkOverlap: 50,
  ollamaUrl: 'http://localhost:11434',
  ollamaEmbedModel: 'nomic-embed-text',
  searchLimit: 10,
  rrfK: 60,
  summarizeApiUrl: '',
  summarizeApiKey: '',
  summarizeModel: '',
};

let cachedConfig: Config | null = null;

function getEnvOverrides(): Partial<Config> {
  const overrides: Partial<Config> = {};

  if (process.env.CONTEXT_CACHE_DB_PATH) {
    overrides.databasePath = process.env.CONTEXT_CACHE_DB_PATH;
  }
  if (process.env.CONTEXT_CACHE_KB_PATH) {
    overrides.knowledgeBasePath = process.env.CONTEXT_CACHE_KB_PATH;
  }
  if (process.env.CONTEXT_CACHE_CHUNK_SIZE) {
    overrides.chunkSize = parseInt(process.env.CONTEXT_CACHE_CHUNK_SIZE, 10);
  }
  if (process.env.CONTEXT_CACHE_CHUNK_OVERLAP) {
    overrides.chunkOverlap = parseInt(process.env.CONTEXT_CACHE_CHUNK_OVERLAP, 10);
  }
  if (process.env.OLLAMA_API_URL) {
    overrides.ollamaUrl = process.env.OLLAMA_API_URL;
  }
  if (process.env.OLLAMA_EMBED_MODEL) {
    overrides.ollamaEmbedModel = process.env.OLLAMA_EMBED_MODEL;
  }
  if (process.env.CONTEXT_CACHE_SEARCH_LIMIT) {
    overrides.searchLimit = parseInt(process.env.CONTEXT_CACHE_SEARCH_LIMIT, 10);
  }
  if (process.env.CONTEXT_CACHE_RRF_K) {
    overrides.rrfK = parseInt(process.env.CONTEXT_CACHE_RRF_K, 10);
  }
  if (process.env.SUMMARIZE_API_URL) {
    overrides.summarizeApiUrl = process.env.SUMMARIZE_API_URL;
  }
  if (process.env.SUMMARIZE_API_KEY) {
    overrides.summarizeApiKey = process.env.SUMMARIZE_API_KEY;
  }
  if (process.env.SUMMARIZE_MODEL) {
    overrides.summarizeModel = process.env.SUMMARIZE_MODEL;
  }

  return overrides;
}

export function loadConfig(customConfig?: Partial<Config>): Config {
  // Return cached config if available (singleton pattern)
  if (cachedConfig) {
    return cachedConfig;
  }

  // Start with defaults
  const config: Config = { ...DEFAULT_CONFIG };

  // Apply environment variable overrides
  const envOverrides = getEnvOverrides();
  Object.assign(config, envOverrides);

  // Apply custom config (highest priority)
  if (customConfig) {
    Object.assign(config, customConfig);
  }

  // Cache the config
  cachedConfig = config;

  return config;
}

export function getConfig<K extends keyof Config>(key: K): Config[K] {
  const config = loadConfig();
  return config[key];
}

// For testing: clear cached config
export function resetConfig(): void {
  cachedConfig = null;
}
