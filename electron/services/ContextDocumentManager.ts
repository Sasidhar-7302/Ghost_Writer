import { app } from 'electron';
import path from 'path';
import fs from 'fs';
const pdf = require('pdf-parse');
import mammoth from 'mammoth';

export class ContextDocumentManager {
    private static instance: ContextDocumentManager;
    private contextDir: string;
    private resumePath: string;
    private jdPath: string;

    private constructor() {
        this.contextDir = path.join(app.getPath('userData'), 'context_documents');
        this.resumePath = path.join(this.contextDir, 'resume.txt');
        this.jdPath = path.join(this.contextDir, 'jd.txt');
        this.ensureDir();
    }

    public static getInstance(): ContextDocumentManager {
        if (!ContextDocumentManager.instance) {
            ContextDocumentManager.instance = new ContextDocumentManager();
        }
        return ContextDocumentManager.instance;
    }

    private ensureDir() {
        if (!fs.existsSync(this.contextDir)) {
            fs.mkdirSync(this.contextDir, { recursive: true });
        }
    }

    public async saveResumeText(text: string): Promise<void> {
        fs.writeFileSync(this.resumePath, text, 'utf-8');
    }

    public async saveJDText(text: string): Promise<void> {
        fs.writeFileSync(this.jdPath, text, 'utf-8');
    }

    public getResumeText(): string {
        try {
            if (fs.existsSync(this.resumePath)) {
                return fs.readFileSync(this.resumePath, 'utf-8');
            }
        } catch (error) {
            console.error('Error reading resume:', error);
        }
        return '';
    }

    public getJDText(): string {
        try {
            if (fs.existsSync(this.jdPath)) {
                return fs.readFileSync(this.jdPath, 'utf-8');
            }
        } catch (error) {
            console.error('Error reading JD:', error);
        }
        return '';
    }

    public async processFile(filePath: string, type: 'resume' | 'jd'): Promise<string> {
        const ext = path.extname(filePath).toLowerCase();
        let text = '';

        try {
            if (ext === '.pdf') {
                const dataBuffer = fs.readFileSync(filePath);
                const data = await pdf(dataBuffer);
                text = data.text;
            } else if (ext === '.docx') {
                const result = await mammoth.extractRawText({ path: filePath });
                text = result.value;
            } else if (ext === '.txt' || ext === '.md') {
                text = fs.readFileSync(filePath, 'utf-8');
            } else {
                throw new Error('Unsupported file format');
            }

            // Clean up text (remove excessive whitespace)
            text = text.replace(/\s+/g, ' ').trim();

            if (type === 'resume') {
                await this.saveResumeText(text);
            } else {
                await this.saveJDText(text);
            }

            return text;
        } catch (error) {
            console.error(`Error processing ${type} file:`, error);
            throw error;
        }
    }

    public clearResume(): void {
        if (fs.existsSync(this.resumePath)) fs.unlinkSync(this.resumePath);
    }

    public clearJD(): void {
        if (fs.existsSync(this.jdPath)) fs.unlinkSync(this.jdPath);
    }
}
