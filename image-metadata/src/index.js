import * as core from '@actions/core';
import * as github from '@actions/github'
import { parse as yamlParse} from 'yaml';

import {getMetadata, registryParse} from './lib.js';


async function main() {
  try {
    const context  = github.context;
    const defaultRepoName = context.payload.repository.name.toLowerCase();

    const registry         = core.getInput('registry');
    const registryUser     = core.getInput('registry-user');
    const registryPassword = core.getInput('registry-password');
    const tag              = core.getInput('tag');
    const imagePlatform    = core.getInput('image-platform');
    const images           = yamlParse(core.getInput('images'));
    let   repoName         = core.getInput('repo-name');

    if (repoName === '') {
      repoName = defaultRepoName;
    }
    repoName = repoName.toLowerCase();
    repoName = repoName.replaceAll('{{ repo }}', defaultRepoName);

    let labels = {};
    let metadata = {};

    for (const image of images) {
      let url = `${registry}/${repoName}/${image}`;
      const { registryUrl, registryImage } = registryParse(url);

      core.info(`Getting metadata for image: ${registryUrl}/${registryImage}:${tag}`);

      const m = await getMetadata(registryUrl, registryUser, registryPassword, registryImage, tag, imagePlatform);
      metadata[image] = m;
      labels[image] = m.config.Labels;
    }

    core.setOutput('metadata', JSON.stringify(metadata));
    core.setOutput('labels', JSON.stringify(labels));

  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
