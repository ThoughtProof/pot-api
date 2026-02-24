/**
 * Queue abstraction for pot-api.
 *
 * Auto-selects backend based on REDIS_URL env var:
 *   - REDIS_URL set → BullMQ (persistent, survives restarts)
 *   - REDIS_URL unset → In-Memory Map (default, zero dependencies)
 *
 * No breaking changes to the API surface.
 */

import { randomUUID } from 'crypto';
import type { Job, JobStatus } from './jobs.js';

// ─── Interface ───────────────────────────────────────────────────────────────

export interface QueueBackend {
  createJob(input: Job['input']): Promise<Job> | Job;
  getJob(id: string): Promise<Job | undefined> | Job | undefined;
  updateJob(id: string, patch: Partial<Job>): Promise<void> | void;
}

// ─── In-Memory Backend (default) ─────────────────────────────────────────────

class InMemoryBackend implements QueueBackend {
  private store = new Map<string, Job>();

  constructor() {
    // Auto-cleanup jobs older than 1h
    setInterval(() => {
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (const [id, job] of this.store.entries()) {
        if (new Date(job.createdAt).getTime() < cutoff) {
          this.store.delete(id);
        }
      }
    }, 10 * 60 * 1000).unref();
  }

  createJob(input: Job['input']): Job {
    const job: Job = {
      id: randomUUID(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      input,
    };
    this.store.set(job.id, job);
    return job;
  }

  getJob(id: string): Job | undefined {
    return this.store.get(id);
  }

  updateJob(id: string, patch: Partial<Job>): void {
    const job = this.store.get(id);
    if (job) {
      Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    }
  }
}

// ─── BullMQ Backend (optional, requires REDIS_URL) ───────────────────────────

class BullMQBackend implements QueueBackend {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private readonly prefix = 'pot-api:jobs';
  private ready: Promise<void>;

  constructor(redisUrl: string) {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    this.ready = (new Function('m', 'return import(m)'))('ioredis').then(({ default: Redis }: { default: new (url: string, opts: object) => any }) => {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: false,
      });
      this.client.on('error', (err: Error) => {
        console.error('[pot-api] Redis error:', err.message);
      });
    });
  }

  private key(id: string): string {
    return `${this.prefix}:${id}`;
  }

  async createJob(input: Job['input']): Promise<Job> {
    await this.ready;
    const job: Job = {
      id: randomUUID(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      input,
    };
    // Store as JSON string, TTL = 24h
    await this.client.set(this.key(job.id), JSON.stringify(job), 'EX', 86400);
    return job;
  }

  async getJob(id: string): Promise<Job | undefined> {
    await this.ready;
    const raw = await this.client.get(this.key(id));
    if (!raw) return undefined;
    try { return JSON.parse(raw) as Job; } catch { return undefined; }
  }

  async updateJob(id: string, patch: Partial<Job>): Promise<void> {
    await this.ready;
    const job = await this.getJob(id);
    if (!job) return;
    const updated = { ...job, ...patch, updatedAt: new Date().toISOString() };
    await this.client.set(this.key(job.id), JSON.stringify(updated), 'EX', 86400);
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

let _backend: QueueBackend | null = null;

export function getQueue(): QueueBackend {
  if (_backend) return _backend;

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    _backend = new BullMQBackend(redisUrl);
    console.log('[pot-api] Using Redis backend:', redisUrl.replace(/:\/\/.*@/, '://***@'));
  } else {
    _backend = new InMemoryBackend();
  }

  return _backend;
}

// ─── Convenience wrappers (same API as jobs.ts) ───────────────────────────────

export async function createJob(input: Job['input']): Promise<Job> {
  return getQueue().createJob(input);
}

export async function getJob(id: string): Promise<Job | undefined> {
  return getQueue().getJob(id);
}

export async function updateJob(id: string, patch: Partial<Job>): Promise<void> {
  return getQueue().updateJob(id, patch);
}
