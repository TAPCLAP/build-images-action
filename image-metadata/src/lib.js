import fetch from 'node-fetch';

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
      'Accept': 'application/vnd.docker.distribution.manifest.v2+json',
      'Authorization': authHeader,
    },
  };

  return makeRequest(url, options);
}

async function getMetadataDigest(registryUrl, username, password, image, digest) {
  const url = `${registryUrl}/v2/${image}/blobs/${digest}`;
  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  const options = {
    method: 'GET',
    headers: {
        'Accept': 'application/vnd.docker.distribution.manifest.v2+json',
        'Authorization': authHeader,
    },
  };

  return makeRequest(url, options);
}
  
export async function getMetadata(registryUrl, username, password, image, tag) {
    try {
        const manifest = await fetchManifest(registryUrl, username, password, image, tag);
        const digest = manifest.config.digest;

        return getMetadataDigest(registryUrl, username, password, image, digest);

    } catch (e) {
        throw new Error(`get metadata error. Error: ${e}`);
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
  } catch(e) {
      throw new Error(`Not valid format of url: "${url}". Error: ${e}`);
  }
  return {
    registryUrl: pUrl.origin,
    registryImage: pUrl.pathname.slice(1),
  };
  
}