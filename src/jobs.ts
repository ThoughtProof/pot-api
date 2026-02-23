import { randomUUID } from 'crypto';

export type JobStatus = 'pending' | 'running' | 'done' | 'error';

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  input: {
    output: string;
    question: string;
    tier: 'basic' | 'pro';
    callbackUrl?: string;
  };
  result?: unknown;
  error?: string;
}

const store = new Map<string, Job>();

// Auto-cleanup jobs older than 1h
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of store.entries()) {
    if (new Date(job.createdAt).getTime() < cutoff) {
      store.delete(id);
    }
  }
}, 10 * 60 * 1000);

export function createJob(input: Job['input']): Job {
  const job: Job = {
    id: randomUUID(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    input,
  };
  store.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return store.get(id);
}

export function updateJob(id: string, patch: Partial<Job>): void {
  const job = store.get(id);
  if (job) {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  }
}
