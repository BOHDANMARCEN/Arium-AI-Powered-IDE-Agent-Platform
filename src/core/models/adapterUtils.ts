export async function withRetries(fn, opts = { retries: 3, baseMs: 200 }) {
  const { retries, baseMs } = opts;
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
}