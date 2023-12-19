import * as core from '@actions/core';
import * as github from '@actions/github'
import { parse as yamlParse} from 'yaml';

import {copyTag} from './lib.js';


async function main() {
  try {
    const context  = github.context;
    const repoName = context.payload.repository.name.toLowerCase();

    const registry         = core.getInput('registry');
    const registryUser     = core.getInput('registry-user');
    const registryPassword = core.getInput('registry-password');
    const fromTag          = core.getInput('from-tag');
    const toTag            = core.getInput('to-tag');
    const images           = yamlParse(core.getInput('images'));
    
    let pushImages = [];

    for (const image of images) {
      let url = `${registry}/${repoName}/${image}`;

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
      
      copyTag(`${pUrl.origin}`, registryUser, registryPassword, `${pUrl.pathname.slice(1)}`, fromTag, toTag);
      pushImages.push(`${registry}/${repoName}/${image}:${toTag}`);
    }

    console.log('\x1b[34m%s\x1b[0m',`built images: ${JSON.stringify(pushImages, null, 2)}`);
    await core.summary
      .addHeading('Built images')
      .addCodeBlock(JSON.stringify(pushImages, null, 2), "json")
      .write()
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
