#!/usr/bin/env node
import express from 'express';
import { verify } from 'pot-sdk';
import { resolveKeys, buildApiKeyRecord, validateConfig } from './config.js';
import { createJob, getJob, updateJob } from './queue.js';
import type { ApiKeys } from './config.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = parseInt(process.env.PORT ?? '3141', 10);

// ─── Health ───────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ name: 'pot-api', version: '0.1.0', status: 'ok' });
});

// ─── Sync verify ──────────────────────────────────────────
app.post('/verify', async (req, res) => {
  const { output, question, tier = 'basic', apiKeys } = req.body as {
    output: string;
    question: string;
    tier?: 'basic' | 'pro';
    apiKeys?: ApiKeys;
  };

  if (!output || !question) {
    res.status(400).json({ error: 'output and question are required' });
    return;
  }

  const keys = resolveKeys(apiKeys);
  const configError = validateConfig(keys);
  if (configError) {
    res.status(400).json({ error: configError });
    return;
  }

  try {
    const result = await verify(output, {
      tier,
      apiKeys: buildApiKeyRecord(keys),
      question,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Async verify ─────────────────────────────────────────
app.post('/verify/async', async (req, res) => {
  const { output, question, tier = 'basic', callbackUrl, apiKeys } = req.body as {
    output: string;
    question: string;
    tier?: 'basic' | 'pro';
    callbackUrl?: string;
    apiKeys?: ApiKeys;
  };

  if (!output || !question) {
    res.status(400).json({ error: 'output and question are required' });
    return;
  }

  const keys = resolveKeys(apiKeys);
  const configError = validateConfig(keys);
  if (configError) {
    res.status(400).json({ error: configError });
    return;
  }

  const job = await createJob({ output, question, tier, callbackUrl });
  res.status(202).json({ jobId: job.id, status: 'pending', pollUrl: `/jobs/${job.id}` });

  // Run in background (no await — fire and forget)
  runJob(job.id, output, question, tier, buildApiKeyRecord(keys), callbackUrl);
});

// ─── Poll job status ───────────────────────────────────────
app.get('/jobs/:id', async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

// ─── Background runner + webhook push ────────────────────
async function runJob(
  jobId: string,
  output: string,
  question: string,
  tier: 'basic' | 'pro',
  apiKeys: Record<string, string>,
  callbackUrl?: string,
) {
  await updateJob(jobId, { status: 'running' });

  try {
    const result = await verify(output, { tier, apiKeys, question });
    await updateJob(jobId, { status: 'done', result });

    if (callbackUrl) {
      await pushWebhook(callbackUrl, { jobId, status: 'done', result });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, { status: 'error', error });

    if (callbackUrl) {
      await pushWebhook(callbackUrl, { jobId, status: 'error', error });
    }
  }
}

async function pushWebhook(url: string, payload: unknown) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.warn(`[pot-api] Webhook delivery failed for ${url}:`, err);
  }
}

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🔍 pot-api running on http://localhost:${PORT}`);
  console.log(`   POST /verify          — sync verification`);
  console.log(`   POST /verify/async    — async + webhook`);
  console.log(`   GET  /jobs/:id        — poll status`);
});
