import { getConfig, loadConfig, resetConfig, Config } from './config';
import * as os from 'os';
import * as path from 'path';

describe('Configuration System', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    // Clear cached config
    resetConfig();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
  });

  test('provides sensible defaults without config file', () => {
    const config = loadConfig();

    expect(config.databasePath).toBe(path.join(os.homedir(), 'git/knowledge-base/db.sqlite'));
    expect(config.knowledgeBasePath).toBe(path.join(os.homedir(), 'git/knowledge-base'));
    expect(config.chunkSize).toBe(500);
    expect(config.chunkOverlap).toBe(50);
    expect(config.embeddingModel).toBe('Xenova/all-MiniLM-L6-v2');
    expect(config.embeddingDimension).toBe(384);
    expect(config.searchLimit).toBe(10);
    expect(config.rrfK).toBe(60);
  });

  test('expands tilde in default paths', () => {
    const config = loadConfig();
    const homeDir = os.homedir();

    expect(config.databasePath.startsWith(homeDir)).toBe(true);
    expect(config.knowledgeBasePath.startsWith(homeDir)).toBe(true);
  });

  test('allows environment variable overrides', () => {
    process.env.CONTEXT_CACHE_DB_PATH = '/custom/db.sqlite';
    process.env.CONTEXT_CACHE_KB_PATH = '/custom/kb';
    process.env.CONTEXT_CACHE_CHUNK_SIZE = '1000';
    process.env.CONTEXT_CACHE_CHUNK_OVERLAP = '100';

    const config = loadConfig();

    expect(config.databasePath).toBe('/custom/db.sqlite');
    expect(config.knowledgeBasePath).toBe('/custom/kb');
    expect(config.chunkSize).toBe(1000);
    expect(config.chunkOverlap).toBe(100);
  });

  test('getConfig returns specific config value', () => {
    const chunkSize = getConfig('chunkSize');
    const rrfK = getConfig('rrfK');

    expect(typeof chunkSize).toBe('number');
    expect(typeof rrfK).toBe('number');
    expect(chunkSize).toBe(500);
    expect(rrfK).toBe(60);
  });

  test('config is singleton across multiple calls', () => {
    const config1 = loadConfig();
    const config2 = loadConfig();

    expect(config1).toBe(config2); // Same object reference
  });

  test('handles custom config values', () => {
    const customConfig: Partial<Config> = {
      chunkSize: 800,
      searchLimit: 20
    };

    const config = loadConfig(customConfig);

    expect(config.chunkSize).toBe(800);
    expect(config.searchLimit).toBe(20);
    // Other values should still be defaults
    expect(config.rrfK).toBe(60);
  });
});
