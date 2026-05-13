import type { Hono } from 'hono';
import type { AppEnv } from '../server.js';

export interface HealthInfo {
  readonly version: string;
  readonly startedAt: string;
}

export function registerHealthRoute(app: Hono<AppEnv>, info: HealthInfo): void {
  app.get('/healthz', (c) => {
    return c.json({
      status: 'ok',
      version: info.version,
      startedAt: info.startedAt,
      uptimeMs: Math.max(0, Date.now() - new Date(info.startedAt).getTime()),
    });
  });
}
