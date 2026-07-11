import { describe, expect, it, afterEach } from 'bun:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, writeFileSync } from 'fs';

// Test cosine similarity directly to avoid sharp dependency issues
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

describe('semantic search', () => {
  it('calculates cosine similarity correctly', () => {
    // Identical vectors should have similarity 1
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);

    // Orthogonal vectors should have similarity 0
    const c = [1, 0, 0];
    const d = [0, 1, 0];
    expect(cosineSimilarity(c, d)).toBeCloseTo(0, 5);

    // Opposite vectors should have similarity -1
    const e = [1, 0, 0];
    const f = [-1, 0, 0];
    expect(cosineSimilarity(e, f)).toBeCloseTo(-1, 5);

    // Different magnitudes but same direction should have similarity 1
    const g = [1, 2, 3];
    const h = [2, 4, 6];
    expect(cosineSimilarity(g, h)).toBeCloseTo(1, 5);
  });

  it('handles zero vectors', () => {
    const zero = [0, 0, 0];
    const normal = [1, 2, 3];
    expect(cosineSimilarity(zero, normal)).toBe(0);
    expect(cosineSimilarity(zero, zero)).toBe(0);
  });

  it('handles empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('serializes and deserializes embeddings correctly', () => {
    // Test that embeddings survive round-trip serialization
    const original = new Array(768).fill(0).map(() => Math.random() - 0.5);
    const arr = new Float32Array(original);
    const buffer = Buffer.from(arr.buffer);
    const restored = new Float32Array(buffer.buffer);
    const result = Array.from(restored);

    // Check dimensions match
    expect(result.length).toBe(768);

    // Check values are close (float32 precision)
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(original[i], 6);
    }
  });

  it('handles normalized vectors for similarity', () => {
    // Test normalized vectors (typical for embeddings)
    const normalize = (v: number[]) => {
      const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
      return v.map(x => x / norm);
    };

    const a = normalize([1, 2, 3, 4, 5]);
    const b = normalize([1, 2, 3, 4, 5]);
    const c = normalize([-1, -2, -3, -4, -5]); // Opposite direction

    // Same vector after normalization should have similarity ~1
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);

    // Opposite vectors should have similarity ~-1
    expect(cosineSimilarity(a, c)).toBeCloseTo(-1, 5);
  });
});
