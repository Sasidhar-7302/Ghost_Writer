import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import os from 'os';

export class RemoteServer {
    private static instance: RemoteServer;
    private server: http.Server | null = null;
    private wss: WebSocketServer | null = null;
    private clients: Set<WebSocket> = new Set();
    private authenticatedClients: Set<WebSocket> = new Set();
    private port: number = 4004;

    private constructor() {}

    public static getInstance(): RemoteServer {
        if (!RemoteServer.instance) {
            RemoteServer.instance = new RemoteServer();
        }
        return RemoteServer.instance;
    }

    public start(): void {
        if (this.server) return;

        this.server = http.createServer((req, res) => {
            // Serve the mobile viewer
            if (req.url === '/' || req.url === '/index.html') {
                // Try multiple possible locations for index.html
                const possiblePaths = [
                    // Standard relative path (works in production or if copied to dist)
                    path.join(__dirname, 'mobile_view', 'index.html'),
                    // Fallback for development (relative to source electron/services)
                    path.join(process.cwd(), 'electron', 'services', 'mobile_view', 'index.html'),
                    // Fallback for production extraResources
                    path.join(process.cwd(), 'resources', 'mobile_view', 'index.html')
                ];

                let filePath = '';
                for (const p of possiblePaths) {
                    if (fs.existsSync(p)) {
                        filePath = p;
                        break;
                    }
                }

                if (filePath) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(fs.readFileSync(filePath));
                } else {
                    console.error('[RemoteServer] Mobile view not found in any of:', possiblePaths);
                    res.writeHead(404);
                    res.end('Mobile view not found');
                }
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });

        this.wss = new WebSocketServer({ server: this.server });

        this.wss.on('connection', (ws) => {
            console.log('[RemoteServer] Mobile client connected');
            this.clients.add(ws);

            ws.on('message', (message: string) => {
                try {
                    const payload = JSON.parse(message.toString());
                    if (payload.type === 'auth') {
                        const { CredentialsManager } = require('./CredentialsManager');
                        const correctPin = CredentialsManager.getInstance().getRemoteDisplayPin();
                        
                        if (payload.pin === correctPin) {
                            console.log('[RemoteServer] Mobile client authenticated');
                            this.authenticatedClients.add(ws);
                            ws.send(JSON.stringify({ type: 'auth_success' }));
                        } else {
                            console.log('[RemoteServer] Mobile client authentication failed');
                            ws.send(JSON.stringify({ type: 'auth_failure', message: 'Invalid PIN' }));
                        }
                    }
                } catch (error) {
                    console.error('[RemoteServer] Error parsing message:', error);
                }
            });

            ws.on('close', () => {
                console.log('[RemoteServer] Mobile client disconnected');
                this.clients.delete(ws);
                this.authenticatedClients.delete(ws);
            });
            
            // Send a welcome message
            ws.send(JSON.stringify({ type: 'status', message: 'Connected to Ghost Writer' }));
        });

        this.server.listen(this.port, '0.0.0.0', () => {
            console.log(`[RemoteServer] Running at http://${this.getLocalIP()}:${this.port}`);
        });
    }

    public stop(): void {
        this.wss?.close();
        this.server?.close();
        this.server = null;
        this.wss = null;
        this.clients.clear();
        this.authenticatedClients.clear();
    }

    public pushAnswer(answer: string, context?: string): void {
        const payload = JSON.stringify({ type: 'answer', data: { answer, context } });
        this.authenticatedClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }

    public pushToken(token: string, intent?: string): void {
        const payload = JSON.stringify({ type: 'token', data: { token, intent } });
        this.authenticatedClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }

    public getLocalIP(): string {
        const interfaces = os.networkInterfaces();
        for (const devName in interfaces) {
            const iface = interfaces[devName];
            if (!iface) continue;
            for (let i = 0; i < iface.length; i++) {
                const alias = iface[i];
                if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                    return alias.address;
                }
            }
        }
        return 'localhost';
    }

    public getConnectionUrl(): string {
        return `http://${this.getLocalIP()}:${this.port}`;
    }
}
