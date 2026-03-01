/**
 * Rate Limiter & Debouncer for Ghost Writer IPC actions.
 * Prevents rapid-fire LLM calls from the renderer process.
 */

export interface RateLimiterOptions {
  /** Minimum milliseconds between calls. Default: 2000 */
  minInterval: number;
  /** Max concurrent calls per action. Default: 1 */
  maxConcurrent: number;
}

const DEFAULT_OPTIONS: RateLimiterOptions = {
  minInterval: 2000,
  maxConcurrent: 1,
};

interface ActionState {
  lastCallTime: number;
  activeCalls: number;
  options: RateLimiterOptions;
}

class RateLimiter {
  private actions = new Map<string, ActionState>();

  /**
   * Register an action with custom rate limits.
   */
  register(action: string, options?: Partial<RateLimiterOptions>): void {
    this.actions.set(action, {
      lastCallTime: 0,
      activeCalls: 0,
      options: { ...DEFAULT_OPTIONS, ...options },
    });
  }

  /**
   * Check if an action can proceed. Returns true if allowed.
   */
  canProceed(action: string): boolean {
    const state = this.actions.get(action);
    if (!state) return true; // Unregistered actions pass through

    const now = Date.now();
    const timeSinceLastCall = now - state.lastCallTime;

    if (timeSinceLastCall < state.options.minInterval) {
      return false;
    }

    if (state.activeCalls >= state.options.maxConcurrent) {
      return false;
    }

    return true;
  }

  /**
   * Mark an action as started.
   */
  markStart(action: string): void {
    const state = this.actions.get(action);
    if (state) {
      state.lastCallTime = Date.now();
      state.activeCalls++;
    }
  }

  /**
   * Mark an action as completed.
   */
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
}

// Singleton instance with pre-registered actions
export const rateLimiter = new RateLimiter();

// Register intelligence actions with appropriate limits
rateLimiter.register('generate-what-to-say', { minInterval: 800, maxConcurrent: 1 });
rateLimiter.register('generate-assist', { minInterval: 3000, maxConcurrent: 1 });
rateLimiter.register('generate-follow-up', { minInterval: 1500, maxConcurrent: 1 });
rateLimiter.register('generate-recap', { minInterval: 2000, maxConcurrent: 1 });
rateLimiter.register('generate-follow-up-questions', { minInterval: 2000, maxConcurrent: 1 });
rateLimiter.register('submit-manual-question', { minInterval: 1500, maxConcurrent: 1 });
rateLimiter.register('gemini-chat', { minInterval: 1000, maxConcurrent: 2 });
rateLimiter.register('gemini-chat-stream', { minInterval: 1000, maxConcurrent: 1 });
rateLimiter.register('generate-followup-email', { minInterval: 3000, maxConcurrent: 1 });

