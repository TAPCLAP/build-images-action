import { execSync } from 'child_process';
import {existsSync, rmdirSync, mkdirSync} from 'fs';
import * as github from '@actions/github'
// import fetch from 'node-fetch';


export const DEFAULT_PUSH_RETRIES = 30;
export const DEFAULT_PUSH_RETRY_INITIAL_DELAY_MS = 2000;
export const DEFAULT_PUSH_RETRY_MAX_DELAY_MS = 60_000;
export const DEFAULT_REGISTRY_CHECK_TIMEOUT_MS = 5000;

export function runCommand(command, exit = true) {
    try {
        console.log('\x1b[34m%s\x1b[0m',`run command: ${command}`);
        execSync(command, { stdio: 'inherit' });
        return true;
      } catch (error) {
        console.error(`Command "${command}" failed with error: ${error.message}`);
        if (exit) {
            process.exit(1);
        }
        return false;
    }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parsePushRetries(value, fallback = DEFAULT_PUSH_RETRIES) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export function isPushCommand(command) {
  return /(^|\s)docker\s+push\s/.test(command) || /(^|\s)--push(\s|$)/.test(command);
}

export function getPushRetryDelayMs(
  failedAttemptIndex,
  initialDelayMs = DEFAULT_PUSH_RETRY_INITIAL_DELAY_MS,
  maxDelayMs = DEFAULT_PUSH_RETRY_MAX_DELAY_MS,
) {
  return Math.min(initialDelayMs * (2 ** failedAttemptIndex), maxDelayMs);
}

export function getRegistryHealthUrl(registry) {
  const host = String(registry || '').split('/')[0];
  return `https://${host}/v2/`;
}

export async function checkRegistryAvailable(registry, options = {}) {
  const {
    timeoutMs = DEFAULT_REGISTRY_CHECK_TIMEOUT_MS,
    fetchFn = fetch,
  } = options;
  const url = getRegistryHealthUrl(registry);
  const startedAt = Date.now();

  console.log(`Checking registry availability: GET ${url}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      method: 'GET',
      signal: controller.signal,
    });
    const elapsedMs = Date.now() - startedAt;
    console.log(`Registry ${registry} is reachable: HTTP ${response.status} (${elapsedMs}ms)`);
    return true;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const reason = error.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : error.message;
    console.log(`Registry ${registry} is not reachable: ${reason} (${elapsedMs}ms). Push will still be attempted.`);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function runCommandWithRetry(command, options = {}) {
  const {
    retries = DEFAULT_PUSH_RETRIES,
    registry,
    initialDelayMs = DEFAULT_PUSH_RETRY_INITIAL_DELAY_MS,
    maxDelayMs = DEFAULT_PUSH_RETRY_MAX_DELAY_MS,
    run = (cmd) => runCommand(cmd, false),
    checkRegistry = checkRegistryAvailable,
    sleepFn = sleep,
    exitFn = (code) => process.exit(code),
  } = options;

  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`Push attempt ${attempt}/${retries}: ${command}`);
    if (registry) {
      await checkRegistry(registry);
    }

    if (run(command)) {
      if (attempt > 1) {
        console.log(`Push succeeded on attempt ${attempt}/${retries}`);
      }
      return true;
    }

    if (attempt === retries) {
      console.error(`Push command failed after ${retries} attempts: ${command}`);
      exitFn(1);
      return false;
    }

    const delayMs = getPushRetryDelayMs(attempt - 1, initialDelayMs, maxDelayMs);
    console.log(`Waiting ${delayMs / 1000}s before push retry ${attempt + 1}/${retries}...`);
    await sleepFn(delayMs);
  }

  return false;
}

export async function runCommandsWithPushRetry(commands, options = {}) {
  const { runNonPush = (cmd) => runCommand(cmd) } = options;
  for (const command of commands) {
    if (isPushCommand(command)) {
      await runCommandWithRetry(command, options);
    } else {
      runNonPush(command);
    }
  }
}

export function generateRandomString(length) {
    const characters = 'abcdefghijklmnopqrstuvwxyz';
    let randomString = '';

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        randomString += characters.charAt(randomIndex);
    }

    return randomString;
}

export function createDir(dir) {
    const folderPath = `./${dir}`;
    if (existsSync(folderPath)) {
        try {
            rmdirSync(folderPath, { recursive: true });
        } catch (err) {
            console.error(`Error deleting folder ${folderPath}: ${err.message}`);
            process.exit(1);
        }
    }
    
    try {
        mkdirSync(folderPath);
    } catch (err) {
        console.error(`Error creating folder ${folderPath}: ${err.message}`);
        process.exit(1);
    }
}

async function makeRequest(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  let r = '';
  try {
    r = await response.json();
  } catch (e) {
    r = '';
  }
  return r;
}

export function getCurrentUtcTimestamp() {
  const now = new Date();

  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0'); // месяцы с 0
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');

  return `${year}${month}${day}${hours}${minutes}`;
}

export function normalizeRefName(str) {
  if (str.includes('/')) {
    const parts = str.split('/');
    return parts.pop(); 
  }
  return str;
}

export function template(str) {
  const context     = github.context;
  const shortCommit = context.sha.slice(0, 10);
  let refName       = normalizeRefName(context.ref);
  
  if (typeof str !== "string") {
    str = String(str); 
  }

  let pr = 'manual';
  if (context.eventName === 'pull_request') {
    pr = context.payload.pull_request.number;
    refName = context.payload.pull_request.head.ref;
  }

  str = str.replaceAll("{{ commit }}", shortCommit);
  str = str.replaceAll("{{ dateTime }}", getCurrentUtcTimestamp());
  str = str.replaceAll("{{ ref }}", refName);
  str = str.replaceAll("{{ pr }}", pr);

  return str;

}
  
// export async function ghcrDeleteVersion(org, repo, token, version) {
//   const url = `https://api.github.com/orgs/${org}/packages/container/${repo}/versions`;
//   const options = {
//     method: 'GET',
//     headers: {
//       'Accept': 'application/vnd.github+json',
//       'Authorization': 'Bearer ' + token,
//       'X-GitHub-Api-Version': '2022-11-28',
//     },
//   };

//   const r = await makeRequest(url, options);
//   const f = r.filter((i) => i.metadata.container.tags.includes(version));
//   console.log(`Found ${f.length} versions for ${version}`);

//   if (f.length > 0) {
//     console.log(`Deleting versions for ${version}`);
//     for (v of f) {
//         console.log(`Deleting version ${v.id}`)
//         const url = `https://api.github.com/orgs/${org}/packages/container/${repo}/versions/${v.id}`;
//         const options = {
//             method: 'DELETE',
//             headers: {
//             'Accept': 'application/vnd.github+json',
//             'Authorization': 'Bearer ' + token,
//             'X-GitHub-Api-Version': '2022-11-28',
//             },
//         };
//         await makeRequest(url, options);
//         console.log(`Deleted version ${v.id} successfully`);
//     }
//   }
// }

