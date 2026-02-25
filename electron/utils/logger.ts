/**
 * Structured Logger for Ghost Writer
 * Production-grade logging with levels, timestamps, file rotation, and context.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL',
};

interface LogEntry {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 5;

export class Logger {
  private static instance: Logger;
  private initialized = false;
  private minLevel: LogLevel = LogLevel.INFO;
  private logDir: string = '';
  private logFilePath: string = '';
  private writeStream: fs.WriteStream | null = null;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  init(options?: { minLevel?: LogLevel; logDir?: string }): void {
    if (this.initialized) return;

    const isDev = process.env.NODE_ENV === 'development';
    this.minLevel = options?.minLevel ?? (isDev ? LogLevel.DEBUG : LogLevel.INFO);

    try {
      this.logDir = options?.logDir ?? path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      this.logFilePath = path.join(this.logDir, 'ghost-writer.log');
      this.rotateIfNeeded();
      this.writeStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
      this.initialized = true;
    } catch {
      this.initialized = true; // Allow app to continue without file logging
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (!fs.existsSync(this.logFilePath)) return;
      const stats = fs.statSync(this.logFilePath);
      if (stats.size < MAX_LOG_SIZE) return;

      // Rotate files: ghost-writer.4.log -> delete, 3->4, 2->3, 1->2, current->1
      for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
        const older = path.join(this.logDir, `ghost-writer.${i}.log`);
        const newer = path.join(this.logDir, `ghost-writer.${i + 1}.log`);
        if (fs.existsSync(older)) {
          if (i === MAX_LOG_FILES - 1) fs.unlinkSync(older);
          else fs.renameSync(older, newer);
        }
      }
      fs.renameSync(this.logFilePath, path.join(this.logDir, 'ghost-writer.1.log'));
    } catch { /* rotation failure is non-critical */ }
  }

  private write(level: LogLevel, module: string, message: string, data?: Record<string, unknown>, error?: Error): void {
    if (level < this.minLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LOG_LEVEL_NAMES[level],
      module,
      message,
    };
    if (data) entry.data = data;
    if (error) entry.error = { message: error.message, stack: error.stack };

    const consoleMsg = `[${entry.timestamp}] [${entry.level}] [${entry.module}] ${entry.message}`;
    if (level >= LogLevel.ERROR) {
      process.stderr.write(consoleMsg + (error ? `\n${error.stack}` : '') + '\n');
    } else {
      process.stdout.write(consoleMsg + '\n');
    }

    if (this.writeStream && !this.writeStream.destroyed) {
      try { this.writeStream.write(JSON.stringify(entry) + '\n'); } catch { /* ignore */ }
    }
  }

  createChild(module: string): ModuleLogger {
    return new ModuleLogger(this, module);
  }

  _write(level: LogLevel, module: string, message: string, data?: Record<string, unknown>, error?: Error): void {
    this.write(level, module, message, data, error);
  }

  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}

export class ModuleLogger {
  constructor(private parent: Logger, private module: string) {}

  debug(message: string, data?: Record<string, unknown>): void {
    this.parent._write(LogLevel.DEBUG, this.module, message, data);
  }
  info(message: string, data?: Record<string, unknown>): void {
    this.parent._write(LogLevel.INFO, this.module, message, data);
  }
  warn(message: string, data?: Record<string, unknown>): void {
    this.parent._write(LogLevel.WARN, this.module, message, data);
  }
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : error ? new Error(String(error)) : undefined;
    this.parent._write(LogLevel.ERROR, this.module, message, data, err);
  }
  fatal(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : error ? new Error(String(error)) : undefined;
    this.parent._write(LogLevel.FATAL, this.module, message, data, err);
  }
}

export const logger = Logger.getInstance();

/**
 * Install global console overrides that route through the structured logger.
 * Call once at app startup to capture console.log/warn/error from all modules.
 */
export function installConsoleOverrides(): void {
  const log = logger.createChild('Console');

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    const msg = args.map(a => (a instanceof Error) ? a.stack || a.message : (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    log.info(msg);
  };

  console.warn = (...args: unknown[]) => {
    const msg = args.map(a => (a instanceof Error) ? a.stack || a.message : (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    log.warn(msg);
  };

  console.error = (...args: unknown[]) => {
    const msg = args.map(a => (a instanceof Error) ? a.stack || a.message : (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    log.error(msg);
  };

  // Preserve original console for direct output
  (console as any)._originalLog = originalLog;
  (console as any)._originalWarn = originalWarn;
  (console as any)._originalError = originalError;
}

