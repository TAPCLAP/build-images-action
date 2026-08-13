import fetch from 'node-fetch';
import * as core from '@actions/core';

const acceptHeader = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

const configAcceptHeader = [
  'application/vnd.oci.image.config.v1+json',
  'application/vnd.docker.container.image.v1+json',
  'application/json',
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

async function fetchManifest(registryUrl, username, password, imageName, tag) {
  const url = `${registryUrl}/v2/${imageName}/manifests/${tag}`;
  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  const options = {
    method: 'GET',
    headers: {
      'Accept': acceptHeader,
      'Authorization': authHeader,
    },
  };
  core.info(`Fetch manifest: ${url}`);

  return makeRequest(url, options);
}

async function getMetadataDigest(registryUrl, username, password, image, digest) {
  const url = `${registryUrl}/v2/${image}/blobs/${digest}`;
  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  const options = {
    method: 'GET',
    headers: {
      'Accept': configAcceptHeader,
      'Authorization': authHeader,
    },
  };
  core.info(`Fetch metadata from digest: ${url}`);

  return makeRequest(url, options);
}

export function parsePlatform(platform) {
  const [os, architecture, variant] = platform.split('/');

  if (!os || !architecture) {
    throw new Error(`Invalid platform: ${platform}`);
  }

  return {
    os,
    architecture,
    ...(variant && { variant }),
  };
}

export function isImageManifest(manifest) {
  return Boolean(manifest?.config?.digest);
}

export function isIndexManifest(manifest) {
  const mediaType = manifest?.mediaType || '';
  return mediaType.includes('image.index')
    || mediaType.includes('manifest.list')
    || Array.isArray(manifest?.manifests);
}

export function selectPlatformManifest(manifests, platform) {
  return manifests.find((m) => {
    if (m.annotations?.['vnd.docker.reference.type'] === 'attestation-manifest') {
      return false;
    }
    if (m.platform?.architecture === 'unknown' || m.platform?.os === 'unknown') {
      return false;
    }
    return m.platform?.architecture === platform.architecture
      && m.platform?.os === platform.os
      && (!platform.variant || m.platform?.variant === platform.variant);
  });
}

export async function resolveToImageManifest(manifest, fetchNested, platform, depth = 0) {
  if (depth > 3) {
    throw new Error('Too many nested manifests');
  }

  if (isImageManifest(manifest)) {
    return manifest;
  }

  if (isIndexManifest(manifest) && manifest.manifests?.length > 0) {
    const selected = selectPlatformManifest(manifest.manifests, platform);
    if (!selected?.digest) {
      throw new Error(`No platform manifest found for ${platform.os}/${platform.architecture}`);
    }
    core.info(`Resolving nested image manifest ${selected.digest}`);
    const nested = await fetchNested(selected.digest);
    return resolveToImageManifest(nested, fetchNested, platform, depth + 1);
  }

  throw new Error(`Unsupported manifest format: ${manifest?.mediaType || 'unknown'}`);
}

export async function getMetadata(registryUrl, username, password, image, tag, p) {
  try {
    const platform = parsePlatform(p);
    const manifest = await fetchManifest(registryUrl, username, password, image, tag);

    core.info(`Manifest fetched for image: ${image}:${tag} (${p}), mediaType: ${manifest.mediaType || 'unknown'}`);

    const imageManifest = await resolveToImageManifest(
      manifest,
      (ref) => fetchManifest(registryUrl, username, password, image, ref),
      platform,
    );

    const digest = imageManifest.config?.digest;
    if (!digest) {
      throw new Error(`No config digest found for image: ${image}:${tag} (${p})`);
    }

    core.info(`Config digest found for image: ${image}:${tag} (${p}). Digest: ${digest}`);

    return getMetadataDigest(registryUrl, username, password, image, digest);
  } catch (e) {
    throw new Error(`get metadata error. Error: ${e}, stack: ${e.stack}`);
  }
}

export function registryParse(url) {
  url = url.replace('http://', 'https://');
  if (!url.startsWith('https://')) {
    url = `https://${url}`;
  }
  let pUrl;
  try {
    pUrl = new URL(url);
  } catch (e) {
    throw new Error(`Not valid format of url: "${url}". Error: ${e}`);
  }
  return {
    registryUrl: pUrl.origin,
    registryImage: pUrl.pathname.slice(1),
  };
}
