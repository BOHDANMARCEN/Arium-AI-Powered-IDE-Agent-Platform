const rateState = new Map<string, { tokens: number; last: number }>();

export function acquireToken(toolId: string, limit = 5, windowMs = 1000) {
  const now = Date.now();
  const state = rateState.get(toolId) || { tokens: limit, last: now };
  const delta = Math.floor((now - state.last) / windowMs) * limit;
  if (delta > 0) state.tokens = Math.min(limit, state.tokens + delta);
  state.last = now;
  if (state.tokens > 0) {
    state.tokens -= 1;
    rateState.set(toolId, state);
    return true;
  }
  rateState.set(toolId, state);
  return false;
}