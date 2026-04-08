import { DatabaseManager } from '../db/DatabaseManager';
import { AnalyticsManager } from '../services/AnalyticsManager';

interface TokenUsage {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    timestamp: Date;
}

interface CostRates {
    [provider: string]: {
        [model: string]: {
            inputCostPerToken: number;
            outputCostPerToken: number;
            currency: string;
        };
    };
}

class CostTracker {
    private static instance: CostTracker;
    private costRates: CostRates = {
        'openai': {
            'gpt-4': { inputCostPerToken: 0.00003, outputCostPerToken: 0.00006, currency: 'USD' },
            'gpt-4-turbo': { inputCostPerToken: 0.00001, outputCostPerToken: 0.00003, currency: 'USD' },
            'gpt-3.5-turbo': { inputCostPerToken: 0.0000015, outputCostPerToken: 0.000002, currency: 'USD' },
        },
        'claude': {
            'claude-3-opus': { inputCostPerToken: 0.000015, outputCostPerToken: 0.000075, currency: 'USD' },
            'claude-3-sonnet': { inputCostPerToken: 0.000003, outputCostPerToken: 0.000015, currency: 'USD' },
            'claude-3-haiku': { inputCostPerToken: 0.00000025, outputCostPerToken: 0.00000125, currency: 'USD' },
        },
        'groq': {
            'llama2-70b': { inputCostPerToken: 0.0000007, outputCostPerToken: 0.0000009, currency: 'USD' },
            'mixtral-8x7b': { inputCostPerToken: 0.00000027, outputCostPerToken: 0.00000027, currency: 'USD' },
        },
        'deepseek': {
            'deepseek-chat': { inputCostPerToken: 0.00000014, outputCostPerToken: 0.00000028, currency: 'USD' },
        },
    };

    private constructor() {}

    static getInstance(): CostTracker {
        if (!CostTracker.instance) {
            CostTracker.instance = new CostTracker();
        }
        return CostTracker.instance;
    }

    calculateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
        const rates = this.costRates[provider]?.[model];
        if (!rates) {
            console.warn(`No cost rates found for ${provider}/${model}`);
            return 0;
        }

        const inputCost = inputTokens * rates.inputCostPerToken;
        const outputCost = outputTokens * rates.outputCostPerToken;
        return inputCost + outputCost;
    }

    async trackUsage(provider: string, model: string, inputTokens: number, outputTokens: number): Promise<void> {
        const cost = this.calculateCost(provider, model, inputTokens, outputTokens);

        const usage: TokenUsage = {
            provider,
            model,
            inputTokens,
            outputTokens,
            cost,
            timestamp: new Date(),
        };

        try {
            const dbManager = DatabaseManager.getInstance();
            await dbManager.saveTokenUsage(usage);

            // SYNC TO SUPABASE (Enterprise Analytics)
            const analytics = AnalyticsManager.getInstance();
            analytics.reportInteraction({
                provider,
                modelId: model,
                inputTokens,
                outputTokens,
                cost,
                durationMs: 0, // Duration tracking can be added later if needed
                metadata: { source: 'CostTracker' }
            }).catch(() => {}); // Fire and forget to not block DB write
        } catch (error) {
            console.error('Failed to save token usage:', error);
        }
    }

    async getUsageStats(days: number = 30): Promise<{
        totalCost: number;
        totalTokens: number;
        byProvider: Record<string, { cost: number; tokens: number }>;
        byModel: Record<string, { cost: number; tokens: number }>;
    }> {
        try {
            const dbManager = DatabaseManager.getInstance();
            const usage = await dbManager.getTokenUsage(days);

            const stats = {
                totalCost: 0,
                totalTokens: 0,
                byProvider: {} as Record<string, { cost: number; tokens: number }>,
                byModel: {} as Record<string, { cost: number; tokens: number }>,
            };

            for (const record of usage) {
                stats.totalCost += record.cost;
                stats.totalTokens += record.inputTokens + record.outputTokens;

                // By provider
                if (!stats.byProvider[record.provider]) {
                    stats.byProvider[record.provider] = { cost: 0, tokens: 0 };
                }
                stats.byProvider[record.provider].cost += record.cost;
                stats.byProvider[record.provider].tokens += record.inputTokens + record.outputTokens;

                // By model
                const modelKey = `${record.provider}/${record.model}`;
                if (!stats.byModel[modelKey]) {
                    stats.byModel[modelKey] = { cost: 0, tokens: 0 };
                }
                stats.byModel[modelKey].cost += record.cost;
                stats.byModel[modelKey].tokens += record.inputTokens + record.outputTokens;
            }

            return stats;
        } catch (error) {
            console.error('Failed to get usage stats:', error);
            return {
                totalCost: 0,
                totalTokens: 0,
                byProvider: {},
                byModel: {},
            };
        }
    }

    async getSessionCost(sessionId: string): Promise<number> {
        try {
            const dbManager = DatabaseManager.getInstance();
            const usage = await dbManager.getTokenUsageForSession(sessionId);
            return usage.reduce((total, record) => total + record.cost, 0);
        } catch (error) {
            console.error('Failed to get session cost:', error);
            return 0;
        }
    }

    formatCost(cost: number, currency: string = 'USD'): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
        }).format(cost);
    }
}

export { CostTracker, TokenUsage };