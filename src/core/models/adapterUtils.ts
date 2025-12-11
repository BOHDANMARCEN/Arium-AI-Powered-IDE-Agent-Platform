export async function withRetries<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number } = { retries: 3, baseMs: 200 }
): Promise<T> {
  const { retries = 3, baseMs = 200 } = opts;
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = baseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
      await new Promise((res) => setTimeout(res, wait));
      attempt++;
    }
  }
  throw new Error("Unreachable");
}