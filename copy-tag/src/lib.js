import fetch from 'node-fetch';
import * as core from '@actions/core';

const acceptHeader = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

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

export function resolveMediaType(contentType, body) {
  const ct = (contentType || '').split(';')[0].trim();
  if (ct && ct !== 'application/json') {
    return ct;
  }

  try {
    const parsed = JSON.parse(body);
    if (parsed.mediaType) {
      return parsed.mediaType;
    }
    if (Array.isArray(parsed.manifests)) {
      return 'application/vnd.oci.image.index.v1+json';
    }
    if (parsed.config) {
      return 'application/vnd.docker.distribution.manifest.v2+json';
    }
  } catch (e) {
    // fall through to default
  }

  return 'application/vnd.docker.distribution.manifest.v2+json';
}

async function fetchManifest(registryUrl, username, password, imageName, tag) {
  const url = `${registryUrl}/v2/${imageName}/manifests/${tag}`;
  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': acceptHeader,
      'Authorization': authHeader,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const body = await response.text();
  const mediaType = resolveMediaType(response.headers.get('content-type'), body);

  return { mediaType, body };
}

async function createManifest(registryUrl, username, password, imageName, tag, mediaType, body) {
  const url = `${registryUrl}/v2/${imageName}/manifests/${tag}`;
  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  const options = {
    method: 'PUT',
    headers: {
      'Content-Type': mediaType,
      'Authorization': authHeader,
    },
    body,
  };

  return makeRequest(url, options);
}

export async function copyTag(registryUrl, username, password, image, fromTag, toTag) {
  try {
    const { mediaType, body } = await fetchManifest(registryUrl, username, password, image, fromTag);
    core.info(`Copying ${image}:${fromTag} -> ${toTag} (${mediaType})`);
    await createManifest(registryUrl, username, password, image, toTag, mediaType, body);
  } catch (e) {
    throw new Error(`Copy manifest error. Error: ${e}`);
  }
}
