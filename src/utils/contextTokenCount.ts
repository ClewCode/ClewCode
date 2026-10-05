/** A diagnostic may call a token-count endpoint, but must never generate text. */
export async function countContextTokens(count: () => Promise<number | null>): Promise<number | null> {
  try {
    const result = await count();
    return result !== null && Number.isFinite(result) && result >= 0 ? result : null;
  } catch {
    return null;
  }
}
