export interface Embedder {
  init(): Promise<void>;
  generateEmbedding(text: string): Promise<number[]>;
}

export async function createEmbedder(): Promise<Embedder> {
  // Lazy load transformers to avoid Jest ESM issues
  const { pipeline } = await import('@xenova/transformers');
  
  let embeddingPipeline: any = null;

  const embedder: Embedder = {
    async init() {
      if (!embeddingPipeline) {
        embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      }
    },

    async generateEmbedding(text: string) {
      if (!embeddingPipeline) {
        await embedder.init();
      }

      const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data) as number[];
    }
  };

  return embedder;
}
