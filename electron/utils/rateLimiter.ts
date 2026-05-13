/**
 * Rate Limiter & Debouncer for Ghost Writer IPC actions.
 * Prevents rapid-fire LLM calls from the renderer process.
 *
 * Features:
 *  - Per-action minimum interval (debounce)
 *  - Per-action max concurrency
 *  - Global sliding-window per-minute cap across ALL LLM calls
 */

export interface RateLimiterOptions {
  /** Minimum milliseconds between calls. Default: 2000 */
  minInterval: number;
  /** Max concurrent calls per action. Default: 1 */
  maxConcurrent: number;
  /**
   * If true, this action counts against the global per-minute LLM quota.
   * Default: false
   */
  countsAgainstGlobalQuota?: boolean;
}

const DEFAULT_OPTIONS: RateLimiterOptions = {
  minInterval: 2000,
  maxConcurrent: 1,
  countsAgainstGlobalQuota: false,
};

/** Global max LLM calls per 60-second sliding window. */
const GLOBAL_LLM_CALLS_PER_MINUTE = 30;
const GLOBAL_WINDOW_MS = 60_000;

interface ActionState {
  lastCallTime: number;
  activeCalls: number;
  options: RateLimiterOptions;
}

class RateLimiter {
  private actions = new Map<string, ActionState>();

  /** Timestamps of recent global-quota LLM calls (sliding window). */
  private globalCallTimestamps: number[] = [];

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------
  register(action: string, options?: Partial<RateLimiterOptions>): void {
    this.actions.set(action, {
      lastCallTime: 0,
      activeCalls: 0,
      options: { ...DEFAULT_OPTIONS, ...options },
    });
  }

  // -----------------------------------------------------------------------
  // Per-action checks
  // -----------------------------------------------------------------------
  canProceed(action: string): boolean {
    const state = this.actions.get(action);
    if (!state) return true;

    const now = Date.now();
    if (now - state.lastCallTime < state.options.minInterval) return false;
    if (state.activeCalls >= state.options.maxConcurrent) return false;

    // Check global quota if applicable
    if (state.options.countsAgainstGlobalQuota) {
      this.pruneGlobalWindow(now);
      if (this.globalCallTimestamps.length >= GLOBAL_LLM_CALLS_PER_MINUTE) {
        console.warn(`[RateLimiter] Global LLM quota exceeded (${GLOBAL_LLM_CALLS_PER_MINUTE}/min). Action: ${action}`);
        return false;
      }
    }

    return true;
  }

  markStart(action: string): void {
    const state = this.actions.get(action);
    if (state) {
      const now = Date.now();
      state.lastCallTime = now;
      state.activeCalls++;
      if (state.options.countsAgainstGlobalQuota) {
        this.pruneGlobalWindow(now);
        this.globalCallTimestamps.push(now);
      }
    }
  }

  markEnd(action: string): void {
    const state = this.actions.get(action);
    if (state && state.activeCalls > 0) {
      state.activeCalls--;
    }
  }

  /**
   * Wrap an async function with rate limiting.
   * Returns a rejected promise if rate-limited.
   */
  wrap<T>(action: string, fn: () => Promise<T>): Promise<T> {
    if (!this.canProceed(action)) {
      return Promise.reject(new Error(`Rate limited: ${action}. Please wait before trying again.`));
    }
    this.markStart(action);
    return fn().finally(() => this.markEnd(action));
  }

  /**
   * Returns per-minute usage stats for monitoring/debugging.
   */
  getGlobalUsage(): { callsInLastMinute: number; limit: number } {
    this.pruneGlobalWindow(Date.now());
    return { callsInLastMinute: this.globalCallTimestamps.length, limit: GLOBAL_LLM_CALLS_PER_MINUTE };
  }

  private pruneGlobalWindow(now: number): void {
    const cutoff = now - GLOBAL_WINDOW_MS;
    // Remove timestamps older than the sliding window
    let i = 0;
    while (i < this.globalCallTimestamps.length && this.globalCallTimestamps[i] < cutoff) i++;
    if (i > 0) this.globalCallTimestamps.splice(0, i);
  }
}

// Singleton instance with pre-registered actions
export const rateLimiter = new RateLimiter();

// Intelligence mode actions — all count against the global quota
const LLM_OPTS = { countsAgainstGlobalQuota: true };
rateLimiter.register('generate-what-to-say',       { minInterval: 800,  maxConcurrent: 1, ...LLM_OPTS });
rateLimiter.register('generate-assist',             { minInterval: 3000, maxConcurrent: 1, ...LLM_OPTS });
rateLimiter.register('generate-follow-up',          { minInterval: 1500, maxConcurrent: 1, ...LLM_OPTS });
rateLimiter.register('generate-recap',              { minInterval: 2000, maxConcurrent: 1, ...LLM_OPTS });
rateLimiter.register('generate-follow-up-questions',{ minInterval: 2000, maxConcurrent: 1, ...LLM_OPTS });
rateLimiter.register('submit-manual-question',      { minInterval: 1500, maxConcurrent: 1, ...LLM_OPTS });
rateLimiter.register('gemini-chat',                 { minInterval: 1000, maxConcurrent: 2, ...LLM_OPTS });
rateLimiter.register('gemini-chat-stream',          { minInterval: 1000, maxConcurrent: 1, ...LLM_OPTS });
rateLimiter.register('generate-followup-email',     { minInterval: 3000, maxConcurrent: 1, ...LLM_OPTS });

