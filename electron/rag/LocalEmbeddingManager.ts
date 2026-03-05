// electron/rag/LocalEmbeddingManager.ts
// Singleton manager for local embedding generation using Transformers.js
// Model: Xenova/all-MiniLM-L6-v2 (384 dimensions)

import path from 'path';
import { app } from 'electron';

export class LocalEmbeddingManager {
    private static instance: LocalEmbeddingManager;
    private extractor: any = null;
    private isInitializing = false;
    private transformers: any = null;

    private constructor() { }

    public static getInstance(): LocalEmbeddingManager {
        if (!LocalEmbeddingManager.instance) {
            LocalEmbeddingManager.instance = new LocalEmbeddingManager();
        }
        return LocalEmbeddingManager.instance;
    }

    /**
     * Initialize the embedding pipeline
     */
    public async initialize(): Promise<void> {
        if (this.extractor || this.isInitializing) return;

        this.isInitializing = true;
        console.log('[LocalEmbeddingManager] Initializing all-MiniLM-L6-v2 pipeline...');

        try {
            if (!this.transformers) {
                const dynamicImport = new Function('specifier', 'return import(specifier)');

                try {
                    // Try normal resolution first (useful during dev)
                    this.transformers = await dynamicImport('@xenova/transformers');
                } catch (e) {
                    // Fallback to absolute path from our custom downloaded ai-runtime zip
                    const { AIRuntimeManager } = require('../services/AIRuntimeManager');
                    const basePath = AIRuntimeManager.getInstance().getTransformersPath();

                    // Since @xenova/transformers has 'src/transformers.js' as its main export in v2.17.2
                    const mainPath = path.join(basePath, 'src', 'transformers.js');
                    const urlPath = require('url').pathToFileURL(mainPath).href;

                    this.transformers = await dynamicImport(urlPath);
                }

                // Configure transformers.js to use local cache in userData
                const userDataPath = app.getPath('userData');
                const modelsPath = path.join(userDataPath, 'models');
                this.transformers.env.cacheDir = modelsPath;
                this.transformers.env.localModelPath = modelsPath;
                this.transformers.env.allowRemoteModels = true;
            }

            // Using feature-extraction pipeline for embeddings
            this.extractor = await this.transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            console.log('[LocalEmbeddingManager] Pipeline initialized successfully');
        } catch (error) {
            console.error('[LocalEmbeddingManager] Failed to initialize pipeline:', error);
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    /**
     * Generate embedding for text
     * Returns 384-dimensional vector
     */
    public async getEmbedding(text: string): Promise<number[]> {
        if (!this.extractor) {
            await this.initialize();
        }

        try {
            // Generate features (embeddings)
            // pooling: 'mean' is standard for MiniLM
            // normalize: true for cosine similarity compatibility
            const output = await this.extractor(text, { pooling: 'mean', normalize: true });

            // Convert to regular array
            return Array.from(output.data);
        } catch (error) {
            console.error('[LocalEmbeddingManager] Embedding generation failed:', error);
            throw error;
        }
    }

    /**
     * Check if model is loaded
     */
    public isReady(): boolean {
        return this.extractor !== null;
    }
}
