export interface FileRecord {
  id: number;
  path: string;
  hash: string;
  indexed_at: string;
  updated_at: string;
}

export interface ChunkRecord {
  id: number;
  file_id: number;
  chunk_index: number;
  content: string;
  raw_text: string;
  embedding: Buffer | null;
}

export interface SearchResult {
  content: string;
  source_path: string;
  score: number;
  chunk_index: number;
}
