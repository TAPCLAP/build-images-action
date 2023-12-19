import fetch from 'node-fetch';
import { URL } from 'url';

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

async function createManifest(registryUrl, username, password, imageName, tag, manifest) {
  const url = `${registryUrl}/v2/${imageName}/manifests/${tag}`;
  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  const options = {
    method: 'PUT',
    headers: {
        'Content-Type': 'application/vnd.docker.distribution.manifest.v2+json',
        'Authorization': authHeader,
    },
    body: JSON.stringify(manifest),
  };

  return makeRequest(url, options);
}
  
export async function copyTag(registryUrl, username, password, image, fromTag, toTag) {

    try {
        const manifest = await fetchManifest(registryUrl, username, password, image, fromTag);
        await createManifest(registryUrl, username, password, image, toTag, manifest);

    } catch (e) {
        throw new Error(`Copy manifest error. Error: ${e}`);
    }
}