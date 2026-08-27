import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePushRetries,
  isPushCommand,
  getPushRetryDelayMs,
  getRegistryHealthUrl,
  checkRegistryAvailable,
  runCommandWithRetry,
  runCommandsWithPushRetry,
  DEFAULT_PUSH_RETRIES,
} from './lib.js';

test('parsePushRetries uses default for invalid values', () => {
  assert.equal(parsePushRetries('30'), 30);
  assert.equal(parsePushRetries(''), DEFAULT_PUSH_RETRIES);
  assert.equal(parsePushRetries('abc'), DEFAULT_PUSH_RETRIES);
  assert.equal(parsePushRetries('0'), DEFAULT_PUSH_RETRIES);
  assert.equal(parsePushRetries('-1'), DEFAULT_PUSH_RETRIES);
});

test('isPushCommand detects docker push and buildx --push', () => {
  assert.equal(isPushCommand('docker push harbor.tapclap.com/reg/app:tag'), true);
  assert.equal(isPushCommand('docker buildx build --push --tag image:tag .'), true);
  assert.equal(isPushCommand('docker tag image:tag image:latest'), false);
  assert.equal(isPushCommand('docker buildx build --load --tag image:tag .'), false);
});

test('getPushRetryDelayMs applies full jitter within exponential cap', () => {
  assert.equal(getPushRetryDelayMs(0, 2000, 60_000, () => 0), 0);
  assert.equal(getPushRetryDelayMs(0, 2000, 60_000, () => 0.5), 1000);
  assert.equal(getPushRetryDelayMs(1, 2000, 60_000, () => 0.5), 2000);
  assert.equal(getPushRetryDelayMs(2, 2000, 60_000, () => 0.5), 4000);
  assert.equal(getPushRetryDelayMs(5, 2000, 60_000, () => 0.5), 30000);
  assert.equal(getPushRetryDelayMs(10, 2000, 60_000, () => 0.999), 59940);
});

test('getRegistryHealthUrl uses host and /v2/', () => {
  assert.equal(getRegistryHealthUrl('harbor.tapclap.com'), 'https://harbor.tapclap.com/v2/');
  assert.equal(getRegistryHealthUrl('harbor.tapclap.com/reg'), 'https://harbor.tapclap.com/v2/');
});

test('checkRegistryAvailable logs reachability and never throws', async () => {
  const reachable = await checkRegistryAvailable('harbor.example.com', {
    fetchFn: async () => ({ status: 401 }),
  });
  assert.equal(reachable, true);

  const unreachable = await checkRegistryAvailable('harbor.example.com', {
    fetchFn: async () => {
      throw new Error('fetch failed');
    },
  });
  assert.equal(unreachable, false);
});

test('runCommandWithRetry retries with backoff until success', async () => {
  let calls = 0;
  const delays = [];
  const registryChecks = [];

  await runCommandWithRetry('docker push example.com/app:tag', {
    retries: 5,
    registry: 'example.com',
    run: () => {
      calls += 1;
      return calls >= 3;
    },
    checkRegistry: async (registry) => {
      registryChecks.push(registry);
      return false;
    },
    sleepFn: async (ms) => {
      delays.push(ms);
    },
    randomFn: () => 0.5,
    exitFn: () => {
      throw new Error('should not exit');
    },
  });

  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
  assert.equal(registryChecks.length, 3);
});

test('runCommandWithRetry does not stop when registry check fails', async () => {
  let calls = 0;

  await runCommandWithRetry('docker push example.com/app:tag', {
    retries: 2,
    registry: 'example.com',
    run: () => {
      calls += 1;
      return true;
    },
    checkRegistry: async () => false,
    sleepFn: async () => {
      throw new Error('should not sleep');
    },
    exitFn: () => {
      throw new Error('should not exit');
    },
  });

  assert.equal(calls, 1);
});

test('runCommandWithRetry exits after exhausting attempts', async () => {
  let calls = 0;
  let exitCode;

  await runCommandWithRetry('docker push example.com/app:tag', {
    retries: 3,
    registry: 'example.com',
    run: () => {
      calls += 1;
      return false;
    },
    checkRegistry: async () => true,
    sleepFn: async () => {},
    exitFn: (code) => {
      exitCode = code;
    },
  });

  assert.equal(calls, 3);
  assert.equal(exitCode, 1);
});

test('runCommandsWithPushRetry retries only push commands', async () => {
  const nonPush = [];
  const retried = [];

  await runCommandsWithPushRetry(
    [
      'docker tag image:tag image:tmp',
      'docker push example.com/app:tmp',
    ],
    {
      retries: 2,
      registry: 'example.com',
      runNonPush: (cmd) => {
        nonPush.push(cmd);
      },
      run: (cmd) => {
        retried.push(cmd);
        return true;
      },
      checkRegistry: async () => true,
      sleepFn: async () => {},
      exitFn: () => {
        throw new Error('should not exit');
      },
    },
  );

  assert.deepEqual(nonPush, ['docker tag image:tag image:tmp']);
  assert.deepEqual(retried, ['docker push example.com/app:tmp']);
});
