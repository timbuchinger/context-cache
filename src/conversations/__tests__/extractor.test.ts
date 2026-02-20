/**
 * Tests for conversation extractor
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { extractConversations } from '../extractor';

describe('Conversation Extractor', () => {
  let testSourceDir: string;
  let testArchiveDir: string;

  beforeEach(() => {
    testSourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-source-'));
    testArchiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-archive-'));
  });

  afterEach(() => {
    if (fs.existsSync(testSourceDir)) {
      fs.rmSync(testSourceDir, { recursive: true, force: true });
    }
    if (fs.existsSync(testArchiveDir)) {
      fs.rmSync(testArchiveDir, { recursive: true, force: true });
    }
  });

  test('finds and copies JSONL files', async () => {
    const file1 = path.join(testSourceDir, 'conv1.jsonl');
    const file2 = path.join(testSourceDir, 'conv2.jsonl');
    
    fs.writeFileSync(file1, 'test content 1');
    fs.writeFileSync(file2, 'test content 2');

    const result = await extractConversations({
      sourceDir: testSourceDir,
      archiveDir: testArchiveDir,
    });

    expect(result.filesFound).toBe(2);
    expect(result.filesCopied).toBe(2);
    expect(result.filesSkipped).toBe(0);
    expect(result.archivedFiles.length).toBe(2);

    expect(fs.existsSync(path.join(testArchiveDir, 'conv1.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(testArchiveDir, 'conv2.jsonl'))).toBe(true);
  });

  test('skips already archived files', async () => {
    const file1 = path.join(testSourceDir, 'conv1.jsonl');
    fs.writeFileSync(file1, 'test content');

    // First extraction
    await extractConversations({
      sourceDir: testSourceDir,
      archiveDir: testArchiveDir,
    });

    // Second extraction (file unchanged)
    const result2 = await extractConversations({
      sourceDir: testSourceDir,
      archiveDir: testArchiveDir,
    });

    expect(result2.filesFound).toBe(1);
    expect(result2.filesCopied).toBe(0);
    expect(result2.filesSkipped).toBe(1);
  });

  test('updates modified files', async () => {
    const file1 = path.join(testSourceDir, 'conv1.jsonl');
    fs.writeFileSync(file1, 'original content');

    await extractConversations({
      sourceDir: testSourceDir,
      archiveDir: testArchiveDir,
    });

    // Wait a moment to ensure different mtime
    await new Promise(resolve => setTimeout(resolve, 10));

    // Modify the file
    fs.writeFileSync(file1, 'updated content');

    const result2 = await extractConversations({
      sourceDir: testSourceDir,
      archiveDir: testArchiveDir,
    });

    expect(result2.filesCopied).toBe(1);
    
    const archivedContent = fs.readFileSync(
      path.join(testArchiveDir, 'conv1.jsonl'),
      'utf-8'
    );
    expect(archivedContent).toBe('updated content');
  });

  test('recursively searches subdirectories', async () => {
    const subdir = path.join(testSourceDir, 'subdir');
    fs.mkdirSync(subdir);
    
    fs.writeFileSync(path.join(testSourceDir, 'conv1.jsonl'), 'content1');
    fs.writeFileSync(path.join(subdir, 'conv2.jsonl'), 'content2');

    const result = await extractConversations({
      sourceDir: testSourceDir,
      archiveDir: testArchiveDir,
    });

    expect(result.filesFound).toBe(2);
    expect(result.filesCopied).toBe(2);
  });

  test('filters files by pattern', async () => {
    fs.writeFileSync(path.join(testSourceDir, 'conv1.jsonl'), 'content1');
    fs.writeFileSync(path.join(testSourceDir, 'conv2.txt'), 'content2');

    const result = await extractConversations({
      sourceDir: testSourceDir,
      archiveDir: testArchiveDir,
      filePattern: /\.jsonl$/,
    });

    expect(result.filesFound).toBe(1);
    expect(result.filesCopied).toBe(1);
  });

  test('handles empty source directory', async () => {
    const result = await extractConversations({
      sourceDir: testSourceDir,
      archiveDir: testArchiveDir,
    });

    expect(result.filesFound).toBe(0);
    expect(result.filesCopied).toBe(0);
    expect(result.filesSkipped).toBe(0);
  });
});
