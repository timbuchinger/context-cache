import { computeFileHash, findMarkdownFiles } from './file-processor';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('File Processor', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `test-kb-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('computes SHA256 hash of file content', () => {
    const testFile = path.join(testDir, 'test.md');
    fs.writeFileSync(testFile, 'Hello, World!');

    const hash = computeFileHash(testFile);

    expect(hash).toBe('dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');
  });

  test('finds all markdown files recursively', () => {
    // Create test structure
    fs.writeFileSync(path.join(testDir, 'file1.md'), 'content1');
    fs.mkdirSync(path.join(testDir, 'subdir'));
    fs.writeFileSync(path.join(testDir, 'subdir', 'file2.md'), 'content2');
    fs.writeFileSync(path.join(testDir, 'ignore.txt'), 'not markdown');

    const files = findMarkdownFiles(testDir);

    expect(files).toHaveLength(2);
    expect(files.some(f => f.endsWith('file1.md'))).toBe(true);
    expect(files.some(f => f.endsWith('file2.md'))).toBe(true);
  });
});
