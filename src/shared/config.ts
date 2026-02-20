import * as os from 'os';
import * as path from 'path';

export interface Config {
  // Database
  databasePath: string;

  // Knowledge Base
  knowledgeBasePath: string;

  // Chunking
  chunkSize: number;
  chunkOverlap: number;

  // Embedding
  embeddingModel: string;
  embeddingDimension: number;

  // Search
  searchLimit: number;
  rrfK: number;
}

const DEFAULT_CONFIG: Config = {
  databasePath: path.join(os.homedir(), 'git/knowledge-base/db.sqlite'),
  knowledgeBasePath: path.join(os.homedir(), 'git/knowledge-base'),
  chunkSize: 500,
  chunkOverlap: 50,
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  embeddingDimension: 384,
  searchLimit: 10,
  rrfK: 60
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
  if (process.env.CONTEXT_CACHE_EMBEDDING_MODEL) {
    overrides.embeddingModel = process.env.CONTEXT_CACHE_EMBEDDING_MODEL;
  }
  if (process.env.CONTEXT_CACHE_SEARCH_LIMIT) {
    overrides.searchLimit = parseInt(process.env.CONTEXT_CACHE_SEARCH_LIMIT, 10);
  }
  if (process.env.CONTEXT_CACHE_RRF_K) {
    overrides.rrfK = parseInt(process.env.CONTEXT_CACHE_RRF_K, 10);
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
