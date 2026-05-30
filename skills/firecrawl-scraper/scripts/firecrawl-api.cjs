#!/usr/bin/env node

/**
 * Firecrawl API Helper Script
 * Provides a CLI wrapper around Firecrawl endpoints for skill integration.
 *
 * Usage:
 *   node firecrawl-api.js <scrape|crawl|map|batch-scrape|crawl-status|batch-status|batch-errors> [<json-string>]
 *   cat payload.json | node firecrawl-api.js scrape
 *   node firecrawl-api.js scrape --file ./payload.json
 *   node firecrawl-api.js crawl --wait < payload.json
 *   node firecrawl-api.js crawl-status <crawl-id> [--wait]
 *   node firecrawl-api.js batch-scrape --wait < payload.json
 *   node firecrawl-api.js batch-status <batch-id> [--wait]
 *   node firecrawl-api.js batch-errors <batch-id>
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.firecrawl.dev';

function loadApiKey() {
  if (process.env.FIRECRAWL_API_KEY) {
    return process.env.FIRECRAWL_API_KEY;
  }

  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/FIRECRAWL_API_KEY\s*=\s*(.+)/);
  if (!match) {
    return null;
  }

  return match[1].trim().replace(/^[\"']|[\"']$/g, '');
}

function usage() {
  const cmd = path.basename(process.argv[1] || 'firecrawl-api.js');
  console.error(
    [
      'Usage:',
      `  node ${cmd} <scrape|crawl|map|batch-scrape|crawl-status|batch-status|batch-errors> [<json-string>]`,
      `  cat payload.json | node ${cmd} scrape`,
      `  node ${cmd} scrape --file ./payload.json`,
      `  node ${cmd} crawl --wait < payload.json`,
      `  node ${cmd} crawl-status <crawl-id> [--wait]`,
      `  node ${cmd} batch-scrape --wait < payload.json`,
      `  node ${cmd} batch-status <batch-id> [--wait]`,
      `  node ${cmd} batch-errors <batch-id>`,
      '',
      'Options:',
      '  --wait  Wait for job completion (crawl / crawl-status / batch-scrape / batch-status)',
      '  --id    Job id (crawl-status / batch-status)',
      '',
      'Env:',
      '  FIRECRAWL_API_KEY (env var) or .env file next to this script',
    ].join('\n'),
  );
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function readPayload(args) {
  const fileFlagIndex = args.findIndex((arg) => arg === '--file');
  if (fileFlagIndex !== -1) {
    const filePath = args[fileFlagIndex + 1];
    if (!filePath) {
      throw new Error('Missing value for --file');
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  }

  const dataFlagIndex = args.findIndex((arg) => arg === '--data');
  if (dataFlagIndex !== -1) {
    const json = args[dataFlagIndex + 1];
    if (!json) {
      throw new Error('Missing value for --data');
    }
    return JSON.parse(json);
  }

  if (args[0] && !args[0].startsWith('-')) {
    return JSON.parse(args[0]);
  }

  if (process.stdin.isTTY) {
    throw new Error('No payload provided (pass JSON arg, --data, --file, or pipe via stdin)');
  }

  const stdin = await readStdin();
  if (!stdin.trim()) {
    throw new Error('Empty stdin payload');
  }
  return JSON.parse(stdin);
}

function requestJson(method, endpointPath, apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? null : JSON.stringify(payload);
    const url = new URL(endpointPath, API_BASE);

    const req = https.request(
      url,
      {
        method,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          ...(body === null
            ? {}
            : {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
              }),
          'User-Agent': 'Firecrawl-Skill/1.0',
        },
        timeout: 60_000,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 300;
          if (!ok) {
            reject(new Error(`API Error ${res.statusCode}: ${data}`));
            return;
          }

          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });

    if (body !== null) {
      req.write(body);
    }
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function takeFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

function takeFlagValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }

  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  args.splice(index, 2);
  return value;
}


function isTerminalSuccessStatus(status) {
  return new Set(['completed', 'complete', 'done', 'success', 'succeeded', 'finished']).has(status);
}

function isTerminalFailureStatus(status) {
  return new Set(['failed', 'error', 'cancelled', 'canceled']).has(status);
}

async function getCrawlStatus(apiKey, crawlId) {
  const safeId = encodeURIComponent(crawlId);
  return requestJson('GET', `/v2/crawl/${safeId}`, apiKey);
}

async function getBatchStatus(apiKey, batchId) {
  const safeId = encodeURIComponent(batchId);
  return requestJson('GET', `/v2/batch/scrape/${safeId}`, apiKey);
}

async function getBatchErrors(apiKey, batchId) {
  const safeId = encodeURIComponent(batchId);
  return requestJson('GET', `/v2/batch/scrape/${safeId}/errors`, apiKey);
}

function extractJobId(result) {
  return [result?.id, result?.jobId, result?.data?.id, result?.data?.jobId]
    .find((v) => typeof v === 'string' && v.trim().length > 0) || null;
}

function extractJobStatus(result) {
  const status = result?.status ?? result?.data?.status;
  if (typeof status !== 'string') return null;
  return status.trim().toLowerCase();
}

async function waitForJobCompletion(apiKey, jobId, getStatus, label) {
  const pollIntervalMs = 3_000;
  for (;;) {
    const statusResult = await getStatus(apiKey, jobId);
    const status = extractJobStatus(statusResult);
    if (!status || isTerminalSuccessStatus(status)) return statusResult;
    if (isTerminalFailureStatus(status)) {
      throw new Error(`${label} ${jobId} ended with status "${status}"`);
    }
    await sleep(pollIntervalMs);
  }
}

const ENDPOINT_BY_COMMAND = {
  scrape: '/v2/scrape',
  crawl: '/v2/crawl',
  map: '/v2/map',
  'batch-scrape': '/v2/batch/scrape',
};

(async () => {
  const command = process.argv[2];
  if (!command || command === '--help' || command === '-h') {
    usage();
    process.exit(command ? 0 : 1);
  }

  const args = process.argv.slice(3);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
  }

  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error('Missing Firecrawl API key: set FIRECRAWL_API_KEY or create .env next to firecrawl-api.js');
    process.exit(1);
  }

  try {
    const wait = takeFlag(args, '--wait');

    // Shared: parse job id from CLI args or JSON payload (crawl-status / batch-status)
    async function parseJobId(args, explicitId) {
      let jobId = explicitId;
      if (!jobId) {
        if (args[0] && !args[0].startsWith('-') && !args[0].trim().startsWith('{')) {
          jobId = args[0];
        }
        const hasJsonPayload =
          args.includes('--file') ||
          args.includes('--data') ||
          (args[0] && args[0].trim().startsWith('{')) ||
          !process.stdin.isTTY;
        if (!jobId && hasJsonPayload) {
          const payload = await readPayload(args);
          jobId = extractJobId(payload);
        }
      }
      return jobId;
    }

    if (command === 'crawl-status') {
      const explicitId = takeFlagValue(args, '--id');
      const crawlId = await parseJobId(args, explicitId);
      if (!crawlId) {
        throw new Error('Missing crawl id (pass <crawl-id>, --id <crawl-id>, or a JSON payload containing id/jobId)');
      }
      const result = wait
        ? await waitForJobCompletion(apiKey, crawlId, getCrawlStatus, 'Crawl job')
        : await getCrawlStatus(apiKey, crawlId);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === 'batch-status') {
      const explicitId = takeFlagValue(args, '--id');
      const batchId = await parseJobId(args, explicitId);
      if (!batchId) {
        throw new Error('Missing batch id (pass <batch-id>, --id <batch-id>, or a JSON payload containing id/jobId)');
      }
      const result = wait
        ? await waitForJobCompletion(apiKey, batchId, getBatchStatus, 'Batch scrape job')
        : await getBatchStatus(apiKey, batchId);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === 'batch-errors') {
      const explicitId = takeFlagValue(args, '--id');
      const batchId = await parseJobId(args, explicitId);
      if (!batchId) {
        throw new Error('Missing batch id (pass <batch-id>, --id <batch-id>, or a JSON payload containing id/jobId)');
      }
      const result = await getBatchErrors(apiKey, batchId);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const endpoint = ENDPOINT_BY_COMMAND[command];
    if (!endpoint) {
      usage();
      process.exit(1);
    }

    if (wait && command !== 'crawl' && command !== 'batch-scrape') {
      throw new Error('--wait is only supported for crawl, crawl-status, batch-scrape, or batch-status');
    }

    const payload = await readPayload(args);
    const result = await requestJson('POST', endpoint, apiKey, payload);

    if (wait) {
      const jobId = extractJobId(result);
      if (!jobId) {
        throw new Error(`Missing job id in ${command} response (expected id/jobId)`);
      }

      const label = command === 'crawl' ? 'Crawl job' : 'Batch scrape job';
      const getStatus = command === 'crawl' ? getCrawlStatus : getBatchStatus;
      const finalResult = await waitForJobCompletion(apiKey, jobId, getStatus, label);
      console.log(JSON.stringify(finalResult, null, 2));
      return;
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
})();
