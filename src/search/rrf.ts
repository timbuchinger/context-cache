export interface RankedResult {
  id: number;
  score: number;
}

export function mergeWithRRF(resultLists: RankedResult[][], k: number = 60): RankedResult[] {
  const scores = new Map<number, number>();

  for (const results of resultLists) {
    results.forEach((result, rank) => {
      const rrfScore = 1 / (k + rank + 1);
      const currentScore = scores.get(result.id) || 0;
      scores.set(result.id, currentScore + rrfScore);
    });
  }

  // Convert to array and sort by RRF score descending
  const merged = Array.from(scores.entries()).map(([id, score]) => ({
    id,
    score,
  }));

  merged.sort((a, b) => b.score - a.score);

  return merged;
}
