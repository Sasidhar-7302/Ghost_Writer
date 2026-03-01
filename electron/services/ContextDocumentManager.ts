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
    private projectKnowledgePath: string;
    private agendaPath: string;

    private constructor() {
        this.contextDir = path.join(app.getPath('userData'), 'context_documents');
        this.resumePath = path.join(this.contextDir, 'resume.txt');
        this.jdPath = path.join(this.contextDir, 'jd.txt');
        this.projectKnowledgePath = path.join(this.contextDir, 'project_knowledge.txt');
        this.agendaPath = path.join(this.contextDir, 'agenda.txt');
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

    public async saveProjectKnowledgeText(text: string): Promise<void> {
        fs.writeFileSync(this.projectKnowledgePath, text, 'utf-8');
    }

    public async saveAgendaText(text: string): Promise<void> {
        fs.writeFileSync(this.agendaPath, text, 'utf-8');
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

    public getProjectKnowledgeText(): string {
        try {
            if (fs.existsSync(this.projectKnowledgePath)) {
                return fs.readFileSync(this.projectKnowledgePath, 'utf-8');
            }
        } catch (error) {
            console.error('Error reading project knowledge:', error);
        }
        return '';
    }

    public getAgendaText(): string {
        try {
            if (fs.existsSync(this.agendaPath)) {
                return fs.readFileSync(this.agendaPath, 'utf-8');
            }
        } catch (error) {
            console.error('Error reading agenda:', error);
        }
        return '';
    }

    public async processFile(filePath: string, type: 'resume' | 'jd' | 'project' | 'agenda'): Promise<string> {
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

            // Clean up text: remove horizontal whitespace redundancy but preserve vertical (newlines)
            text = text
                .split('\n')
                .map(line => line.replace(/[ \t]+/g, ' ').trim())
                .filter(line => line.length > 0)
                .join('\n');

            if (type === 'resume') {
                await this.saveResumeText(text);
            } else if (type === 'jd') {
                await this.saveJDText(text);
            } else if (type === 'project') {
                await this.saveProjectKnowledgeText(text);
            } else if (type === 'agenda') {
                await this.saveAgendaText(text);
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

    public clearProjectKnowledge(): void {
        if (fs.existsSync(this.projectKnowledgePath)) fs.unlinkSync(this.projectKnowledgePath);
    }

    public clearAgenda(): void {
        if (fs.existsSync(this.agendaPath)) fs.unlinkSync(this.agendaPath);
    }
}
