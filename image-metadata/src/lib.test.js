import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePlatform,
  isImageManifest,
  isIndexManifest,
  selectPlatformManifest,
  resolveToImageManifest,
} from './lib.js';

const dockerV2Manifest = {
  schemaVersion: 2,
  mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
  config: {
    mediaType: 'application/vnd.docker.container.image.v1+json',
    digest: 'sha256:config-old',
    size: 1234,
  },
  layers: [],
};

const ociImageManifest = {
  schemaVersion: 2,
  mediaType: 'application/vnd.oci.image.manifest.v1+json',
  config: {
    mediaType: 'application/vnd.oci.image.config.v1+json',
    digest: 'sha256:config-new',
    size: 1996,
  },
  layers: [],
};

const ociIndex = {
  schemaVersion: 2,
  mediaType: 'application/vnd.oci.image.index.v1+json',
  manifests: [
    {
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      digest: 'sha256:86e2f4cee787fd3fc6bcd2c3a34a2719d19fae3bf2aa16ac5a621238c336fb9e',
      size: 1996,
      platform: {
        architecture: 'amd64',
        os: 'linux',
      },
    },
    {
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      digest: 'sha256:c4f42221a2718c4c0f43f505909a67f0b8df2d8e7381ccabb47195e7e2f0cc04',
      size: 837,
      annotations: {
        'vnd.docker.reference.digest': 'sha256:86e2f4cee787fd3fc6bcd2c3a34a2719d19fae3bf2aa16ac5a621238c336fb9e',
        'vnd.docker.reference.type': 'attestation-manifest',
      },
      platform: {
        architecture: 'unknown',
        os: 'unknown',
      },
    },
  ],
};

test('parsePlatform splits os/arch/variant', () => {
  assert.deepEqual(parsePlatform('linux/amd64'), { os: 'linux', architecture: 'amd64' });
  assert.deepEqual(parsePlatform('linux/arm64/v8'), { os: 'linux', architecture: 'arm64', variant: 'v8' });
  assert.throws(() => parsePlatform('linux'), /Invalid platform/);
});

test('detects docker v2 image manifest vs oci index', () => {
  assert.equal(isImageManifest(dockerV2Manifest), true);
  assert.equal(isIndexManifest(dockerV2Manifest), false);
  assert.equal(isImageManifest(ociIndex), false);
  assert.equal(isIndexManifest(ociIndex), true);
  assert.equal(isImageManifest(ociImageManifest), true);
});

test('selectPlatformManifest skips attestation and picks linux/amd64', () => {
  const selected = selectPlatformManifest(ociIndex.manifests, parsePlatform('linux/amd64'));
  assert.equal(selected.digest, 'sha256:86e2f4cee787fd3fc6bcd2c3a34a2719d19fae3bf2aa16ac5a621238c336fb9e');
});

test('resolveToImageManifest returns docker v2 manifest as-is', async () => {
  const resolved = await resolveToImageManifest(dockerV2Manifest, async () => {
    throw new Error('should not fetch nested manifest');
  }, parsePlatform('linux/amd64'));

  assert.equal(resolved.config.digest, 'sha256:config-old');
});

test('resolveToImageManifest follows oci index to image manifest', async () => {
  const resolved = await resolveToImageManifest(ociIndex, async (digest) => {
    assert.equal(digest, 'sha256:86e2f4cee787fd3fc6bcd2c3a34a2719d19fae3bf2aa16ac5a621238c336fb9e');
    return ociImageManifest;
  }, parsePlatform('linux/amd64'));

  assert.equal(resolved.config.digest, 'sha256:config-new');
});
