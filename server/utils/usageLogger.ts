/**
 * Token & usage tracking for cost monitoring.
 * Logs input/output token counts to a local file.
 */

import fs from 'fs';
import path from 'path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const USAGE_FILE = path.join(LOG_DIR, 'usage.json');

export interface UsageEntry {
  timestamp: string;
  requestId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs?: number;
}

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Append a usage entry to the log file (one JSON line per entry for easy parsing).
 */
export function logUsage(entry: UsageEntry): void {
  try {
    ensureLogDir();
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(USAGE_FILE, line);
  } catch (err) {
    console.error('[usageLogger] Failed to write usage log:', err);
  }
}

/**
 * Read recent usage entries (last N lines). Useful for dashboards.
 */
export function readRecentUsage(limit: number = 100): UsageEntry[] {
  try {
    if (!fs.existsSync(USAGE_FILE)) return [];
    const content = fs.readFileSync(USAGE_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line) as UsageEntry)
      .reverse();
  } catch {
    return [];
  }
}
