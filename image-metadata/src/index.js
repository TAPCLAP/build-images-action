import * as core from '@actions/core';
import * as github from '@actions/github'
import { parse as yamlParse} from 'yaml';

import {getMetadata, registryParse} from './lib.js';


async function main() {
  try {
    const context  = github.context;
    const repoName = context.payload.repository.name.toLowerCase();

    const registry         = core.getInput('registry');
    const registryUser     = core.getInput('registry-user');
    const registryPassword = core.getInput('registry-password');
    const tag              = core.getInput('tag');
    const images           = yamlParse(core.getInput('images'));

    let labels = {};
    let metadata = {};

    for (const image of images) {
      let url = `${registry}/${repoName}/${image}`;
      const { registryUrl, registryImage } = registryParse(url);

      const m = await getMetadata(registryUrl, registryUser, registryPassword, registryImage, tag);
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
