
import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import { logger, ModuleLogger } from '../utils/logger';

// Interfaces for our data objects
export interface Meeting {
    id: string;
    title: string;
    date: string; // ISO string
    duration: string;
    summary: string;
    detailedSummary?: {
        overview?: string;
        actionItems: string[];
        keyPoints: string[];
        actionItemsTitle?: string;
        keyPointsTitle?: string;
    };
    transcript?: Array<{
        speaker: string;
        text: string;
        timestamp: number;
    }>;
    usage?: Array<{
        type: 'assist' | 'followup' | 'chat' | 'followup_questions';
        timestamp: number;
        question?: string;
        answer?: string;
        items?: string[];
    }>;
    calendarEventId?: string;
    source?: 'manual' | 'calendar';
    isProcessed?: boolean;
    screenshots?: string[];
    context_json?: string;
}

export interface TokenUsage {
    id?: number;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    timestamp: Date;
    sessionId?: string;
}

export interface UserProfile {
    fullName: string;
    preferredName?: string;
    email?: string;
    currentRole?: string;
    company?: string;
    targetRole?: string;
    createdAt?: string;
    updatedAt?: string;
}

export class DatabaseManager {
    private static instance: DatabaseManager;
    private db: Database.Database | null = null;
    private dbPath: string;
    private log: ModuleLogger;

    private constructor() {
        this.log = logger.createChild('DatabaseManager');
        const userDataPath = app.getPath('userData');
        this.dbPath = path.join(userDataPath, 'ghost-writer.db');
        this.init();
    }

    public static getInstance(): DatabaseManager {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }

    private init() {
        try {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.db = new Database(this.dbPath);
            this.runMigrations();
        } catch (error) {
            this.log.error('Failed to initialize database', error);
            throw error;
        }
    }

    private runMigrations() {
        if (!this.db) return;

        const createMeetingsTable = `
            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                title TEXT,
                start_time INTEGER,
                duration_ms INTEGER,
                summary_json TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                calendar_event_id TEXT,
                source TEXT,
                screenshots_json TEXT
            );
        `;

        const createTranscriptsTable = `
            CREATE TABLE IF NOT EXISTS transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT,
                speaker TEXT,
                content TEXT,
                timestamp_ms INTEGER,
                FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
        `;

        const createAiInteractionsTable = `
            CREATE TABLE IF NOT EXISTS ai_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT,
                type TEXT,
                timestamp INTEGER,
                user_query TEXT,
                ai_response TEXT,
                metadata_json TEXT,
                FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
        `;

        this.db.exec(createMeetingsTable);
        this.db.exec(createTranscriptsTable);
        this.db.exec(createAiInteractionsTable);

        const createUserProfileTable = `
            CREATE TABLE IF NOT EXISTS user_profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                full_name TEXT NOT NULL,
                preferred_name TEXT,
                email TEXT,
                current_role TEXT,
                company TEXT,
                target_role TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `;
        this.db.exec(createUserProfileTable);

        const createChunksTable = `
            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                speaker TEXT,
                start_timestamp_ms INTEGER,
                end_timestamp_ms INTEGER,
                cleaned_text TEXT NOT NULL,
                token_count INTEGER NOT NULL,
                embedding BLOB,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
        `;
        this.db.exec(createChunksTable);

        const createChunkSummariesTable = `
            CREATE TABLE IF NOT EXISTS chunk_summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL UNIQUE,
                summary_text TEXT NOT NULL,
                embedding BLOB,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );
        `;
        this.db.exec(createChunkSummariesTable);

        const createEmbeddingQueueTable = `
            CREATE TABLE IF NOT EXISTS embedding_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL,
                chunk_id INTEGER,
                status TEXT DEFAULT 'pending',
                retry_count INTEGER DEFAULT 0,
                error_message TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                processed_at TEXT
            );
        `;
        this.db.exec(createEmbeddingQueueTable);

        try {
            this.db.exec("CREATE INDEX IF NOT EXISTS idx_chunks_meeting ON chunks(meeting_id)");
        } catch (e) { }

        try { this.db.exec("ALTER TABLE meetings ADD COLUMN calendar_event_id TEXT"); } catch (e) { }
        try { this.db.exec("ALTER TABLE meetings ADD COLUMN source TEXT"); } catch (e) { }
        try { this.db.exec("ALTER TABLE meetings ADD COLUMN context_json TEXT"); } catch (e) { }
        try { this.db.exec("ALTER TABLE meetings ADD COLUMN is_processed INTEGER DEFAULT 1"); } catch (e) { }

        const createTokenUsageTable = `
            CREATE TABLE IF NOT EXISTS token_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                input_tokens INTEGER NOT NULL,
                output_tokens INTEGER NOT NULL,
                cost REAL NOT NULL,
                timestamp TEXT NOT NULL,
                session_id TEXT
            );
        `;
        this.db.exec(createTokenUsageTable);

        try {
            this.db.exec("CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp)");
            this.db.exec("CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(provider)");
        } catch (e) { }
    }

    private deleteScreenshotFiles(paths: string[]): void {
        for (const screenshotPath of paths) {
            if (!screenshotPath) continue;
            try {
                if (fs.existsSync(screenshotPath)) {
                    fs.unlinkSync(screenshotPath);
                }
            } catch (error) {
                console.warn(`[DatabaseManager] Failed to delete screenshot ${screenshotPath}:`, error);
            }
        }
    }

    public getUserProfile(): UserProfile | null {
        if (!this.db) return null;
        const row = this.db.prepare(`
            SELECT full_name, preferred_name, email, current_role, company, target_role, created_at, updated_at
            FROM user_profile
            WHERE id = 1
        `).get() as any;
        if (!row) return null;
        return {
            fullName: row.full_name,
            preferredName: row.preferred_name || '',
            email: row.email || '',
            currentRole: row.current_role || '',
            company: row.company || '',
            targetRole: row.target_role || '',
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    public saveUserProfile(profile: UserProfile): boolean {
        if (!this.db) return false;
        const fullName = profile.fullName?.trim();
        if (!fullName) return false;
        const now = new Date().toISOString();
        try {
            const existing = this.getUserProfile();
            this.db.prepare(`
                INSERT INTO user_profile (id, full_name, preferred_name, email, current_role, company, target_role, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    full_name = excluded.full_name,
                    preferred_name = excluded.preferred_name,
                    email = excluded.email,
                    current_role = excluded.current_role,
                    company = excluded.company,
                    target_role = excluded.target_role,
                    updated_at = excluded.updated_at
            `).run(1, fullName, profile.preferredName?.trim() || null, profile.email?.trim() || null, profile.currentRole?.trim() || null, profile.company?.trim() || null, profile.targetRole?.trim() || null, existing?.createdAt || now, now);
            return true;
        } catch (error) {
            console.error('[DatabaseManager] Failed to save user profile:', error);
            return false;
        }
    }

    public saveMeeting(meeting: Meeting, startTimeMs: number, durationMs: number) {
        if (!this.db) return;

        const insertMeeting = this.db.prepare(`
            INSERT OR REPLACE INTO meetings (id, title, start_time, duration_ms, summary_json, created_at, calendar_event_id, source, is_processed, screenshots_json, context_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertTranscript = this.db.prepare(`
            INSERT INTO transcripts (meeting_id, speaker, content, timestamp_ms)
            VALUES (?, ?, ?, ?)
        `);

        const insertInteraction = this.db.prepare(`
            INSERT INTO ai_interactions (meeting_id, type, timestamp, user_query, ai_response, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const summaryJson = JSON.stringify({
            legacySummary: meeting.summary,
            detailedSummary: meeting.detailedSummary
        });

        const runTransaction = this.db.transaction(() => {
            insertMeeting.run(meeting.id, meeting.title, startTimeMs, durationMs, summaryJson, meeting.date, meeting.calendarEventId || null, meeting.source || 'manual', meeting.isProcessed ? 1 : 0, JSON.stringify(meeting.screenshots || []), meeting.context_json || null);

            if (meeting.transcript) {
                for (const segment of meeting.transcript) {
                    insertTranscript.run(meeting.id, segment.speaker, segment.text, segment.timestamp);
                }
            }

            if (meeting.usage) {
                for (const usage of meeting.usage) {
                    let metadata = null;
                    if (usage.items) {
                        metadata = JSON.stringify(usage.items);
                    } else if (usage.type === 'followup_questions' && usage.answer && Array.isArray(usage.answer)) {
                        metadata = JSON.stringify(usage.answer);
                    }
                    const answerText = Array.isArray(usage.answer) ? null : usage.answer || null;
                    insertInteraction.run(meeting.id, usage.type, usage.timestamp, usage.question || null, answerText, metadata);
                }
            }
        });

        try {
            runTransaction();
        } catch (err) {
            console.error(`[DatabaseManager] Failed to save meeting ${meeting.id}`, err);
            throw err;
        }
    }

    public updateMeetingTitle(id: string, title: string): boolean {
        if (!this.db) return false;
        try {
            const stmt = this.db.prepare('UPDATE meetings SET title = ? WHERE id = ?');
            const info = stmt.run(title, id);
            return info.changes > 0;
        } catch (error) {
            console.error(`[DatabaseManager] Failed to update title for meeting ${id}:`, error);
            return false;
        }
    }

    public updateMeetingSummary(id: string, updates: { overview?: string, actionItems?: string[], keyPoints?: string[], actionItemsTitle?: string, keyPointsTitle?: string }): boolean {
        if (!this.db) return false;
        try {
            const row = this.db.prepare('SELECT summary_json FROM meetings WHERE id = ?').get(id) as any;
            if (!row) return false;
            const existingData = JSON.parse(row.summary_json || '{}');
            const currentDetailed = existingData.detailedSummary || {};
            const newDetailed = { ...currentDetailed, ...updates };
            const newData = { ...existingData, detailedSummary: newDetailed };
            const stmt = this.db.prepare('UPDATE meetings SET summary_json = ? WHERE id = ?');
            const info = stmt.run(JSON.stringify(newData), id);
            return info.changes > 0;
        } catch (error) {
            console.error(`[DatabaseManager] Failed to update summary for meeting ${id}:`, error);
            return false;
        }
    }

    private formatDuration(ms: number): string {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return hours > 0 
            ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            : `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    public getRecentMeetings(limit: number = 50): Meeting[] {
        if (!this.db) return [];
        const stmt = this.db.prepare(`SELECT * FROM meetings ORDER BY created_at DESC LIMIT ?`);
        const rows = stmt.all(limit) as any[];
        return rows.map(row => ({
            id: row.id,
            title: row.title,
            date: row.created_at,
            duration: this.formatDuration(row.duration_ms),
            summary: JSON.parse(row.summary_json || '{}').legacySummary || '',
            detailedSummary: JSON.parse(row.summary_json || '{}').detailedSummary,
            calendarEventId: row.calendar_event_id,
            source: row.source,
            transcript: [] as any[],
            usage: [] as any[],
            screenshots: [] as string[]
        }));
    }

    public getMeetingDetails(id: string): Meeting | null {
        if (!this.db) return null;
        const meetingRow = this.db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as any;
        if (!meetingRow) return null;

        const transcriptRows = this.db.prepare('SELECT * FROM transcripts WHERE meeting_id = ? ORDER BY timestamp_ms ASC').all(id) as any[];
        const usageRows = this.db.prepare('SELECT * FROM ai_interactions WHERE meeting_id = ? ORDER BY timestamp ASC').all(id) as any[];

        const summaryData = JSON.parse(meetingRow.summary_json || '{}');
        return {
            id: meetingRow.id,
            title: meetingRow.title,
            date: meetingRow.created_at,
            duration: this.formatDuration(meetingRow.duration_ms),
            summary: summaryData.legacySummary || '',
            detailedSummary: summaryData.detailedSummary,
            calendarEventId: meetingRow.calendar_event_id,
            source: meetingRow.source,
            transcript: transcriptRows.map(row => ({ speaker: row.speaker, text: row.content, timestamp: row.timestamp_ms })),
            usage: usageRows.map(row => {
                let items: string[] | undefined;
                if (row.metadata_json) {
                    try { const parsed = JSON.parse(row.metadata_json); if (Array.isArray(parsed)) items = parsed; } catch (e) { }
                }
                return { type: row.type, timestamp: row.timestamp, question: row.user_query, answer: row.ai_response, items };
            }),
            screenshots: JSON.parse(meetingRow.screenshots_json || '[]'),
            context_json: meetingRow.context_json
        };
    }

    public meetingExists(id: string): boolean {
        if (!this.db) return false;
        return !!this.db.prepare('SELECT 1 FROM meetings WHERE id = ? LIMIT 1').get(id);
    }

    public deleteMeeting(id: string): boolean {
        if (!this.db) return false;
        try {
            const row = this.db.prepare('SELECT screenshots_json FROM meetings WHERE id = ?').get(id) as any;
            const info = this.db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
            if (info.changes > 0 && row?.screenshots_json) {
                try {
                    const screenshots = JSON.parse(row.screenshots_json || '[]');
                    if (Array.isArray(screenshots)) this.deleteScreenshotFiles(screenshots);
                } catch { }
            }
            return info.changes > 0;
        } catch (error) {
            console.error(`[DatabaseManager] Failed to delete meeting ${id}:`, error);
            return false;
        }
    }

    public getUnprocessedMeetings(): Meeting[] {
        if (!this.db) return [];
        const rows = this.db.prepare(`SELECT * FROM meetings WHERE is_processed = 0 ORDER BY created_at DESC`).all() as any[];
        return rows.map(row => ({
            id: row.id,
            title: row.title,
            date: row.created_at,
            duration: this.formatDuration(row.duration_ms),
            summary: JSON.parse(row.summary_json || '{}').legacySummary || '',
            detailedSummary: JSON.parse(row.summary_json || '{}').detailedSummary,
            calendarEventId: row.calendar_event_id,
            source: row.source,
            isProcessed: false,
            transcript: [] as any[],
            usage: [] as any[]
        }));
    }

    public clearAllData(): boolean {
        if (!this.db) return false;
        try {
            const meetingRows = this.db.prepare('SELECT screenshots_json FROM meetings').all() as any[];
            for (const row of meetingRows) {
                try {
                    const screenshots = JSON.parse(row.screenshots_json || '[]');
                    if (Array.isArray(screenshots)) this.deleteScreenshotFiles(screenshots);
                } catch { }
            }
            this.db.exec('DELETE FROM embedding_queue; DELETE FROM chunk_summaries; DELETE FROM chunks; DELETE FROM ai_interactions; DELETE FROM transcripts; DELETE FROM meetings; DELETE FROM user_profile;');
            const meetingScreenshotDir = path.join(app.getPath('userData'), 'meeting_screenshots');
            if (fs.existsSync(meetingScreenshotDir)) fs.rmSync(meetingScreenshotDir, { recursive: true, force: true });
            return true;
        } catch (error) {
            console.error('[DatabaseManager] Failed to clear all data:', error);
            return false;
        }
    }

    public seedDemoMeeting() {
        if (!this.db) return;
        const demoId = 'demo-meeting';
        this.deleteMeeting(demoId);
        const today = new Date();
        today.setHours(9, 30, 0, 0);
        const durationMs = 300000;
        const demoMeeting: Meeting = {
            id: demoId,
            title: "Ghost Writer Demo & Guide",
            date: today.toISOString(),
            duration: "5:00",
            summary: "An interactive demonstration showcasing Ghost Writer's core functionality.",
            detailedSummary: { overview: "# Demo Overview", actionItems: ["Test the buttons"], keyPoints: ["Stealth mode is active"] },
            transcript: [],
            usage: [],
            isProcessed: true
        };
        this.saveMeeting(demoMeeting, today.getTime(), durationMs);
    }

    public saveTokenUsage(usage: TokenUsage): void {
        if (!this.db) return;
        this.db.prepare(`INSERT INTO token_usage (provider, model, input_tokens, output_tokens, cost, timestamp, session_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(usage.provider, usage.model, usage.inputTokens, usage.outputTokens, usage.cost, usage.timestamp.toISOString(), usage.sessionId || null);
    }

    public getTokenUsage(days: number = 30): TokenUsage[] {
        if (!this.db) return [];
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const rows = this.db.prepare(`SELECT * FROM token_usage WHERE timestamp >= ? ORDER BY timestamp DESC`).all(cutoffDate.toISOString()) as any[];
        return rows.map(row => ({ id: row.id, provider: row.provider, model: row.model, inputTokens: row.input_tokens, outputTokens: row.output_tokens, cost: row.cost, timestamp: new Date(row.timestamp), sessionId: row.session_id }));
    }

    public getTokenUsageForSession(sessionId: string): TokenUsage[] {
        if (!this.db) return [];
        const rows = this.db.prepare(`SELECT * FROM token_usage WHERE session_id = ? ORDER BY timestamp DESC`).all(sessionId) as any[];
        return rows.map(row => ({ id: row.id, provider: row.provider, model: row.model, inputTokens: row.input_tokens, outputTokens: row.output_tokens, cost: row.cost, timestamp: new Date(row.timestamp), sessionId: row.session_id }));
    }
}
