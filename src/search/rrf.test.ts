import { mergeWithRRF, RankedResult } from './rrf';

describe('Reciprocal Rank Fusion', () => {
  test('merges two result lists with RRF', () => {
    const bm25Results: RankedResult[] = [
      { id: 1, score: -0.5 },
      { id: 2, score: -1.0 },
      { id: 3, score: -1.5 },
    ];

    const vectorResults: RankedResult[] = [
      { id: 2, score: 0.9 },
      { id: 1, score: 0.8 },
      { id: 4, score: 0.7 },
    ];

    const merged = mergeWithRRF([bm25Results, vectorResults], 60);

    expect(merged.length).toBeGreaterThan(0);
    expect(merged[0].id).toBeDefined();
    expect(merged[0].score).toBeGreaterThan(0);
  });

  test('handles single result list', () => {
    const results: RankedResult[] = [
      { id: 1, score: 0.9 },
      { id: 2, score: 0.8 },
    ];

    const merged = mergeWithRRF([results], 60);

    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe(1);
  });

  test('ranks item appearing in both lists higher', () => {
    const list1: RankedResult[] = [
      { id: 1, score: 0.9 },
      { id: 2, score: 0.5 },
    ];

    const list2: RankedResult[] = [
      { id: 2, score: 0.8 },
      { id: 3, score: 0.6 },
    ];

    const merged = mergeWithRRF([list1, list2], 60);

    // Item 2 appears in both lists so should be ranked highly
    expect(merged[0].id).toBe(2);
  });
});
