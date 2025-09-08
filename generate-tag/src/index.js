import 'source-map-support/register.js';
import * as core from '@actions/core';
import * as github from '@actions/github'
import { parse as yamlParse } from 'yaml';


function getCurrentUtcTimestamp() {
  const now = new Date();

  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0'); // месяцы с 0
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');

  return `${year}${month}${day}${hours}${minutes}`;
}

function normalizeRefName(str) {
  if (str.includes('/')) {
    const parts = str.split('/');
    return parts.pop(); 
  }
  return str;
}

async function main() {
    try {
        const context = github.context;
        const template = core.getInput('template');
        const params = yamlParse(core.getInput('params'));
        const shortCommit = context.sha.slice(0, 10);
        const refName = normalizeRefName(context.ref);

        let result = template;
        result = result.replaceAll("{{ commit }}", shortCommit);
        result = result.replaceAll("{{ dateTime }}", getCurrentUtcTimestamp());
        result = result.replaceAll("{{ ref }}", refName);

        for (const k in params) {
            const p = params[k];
            result = result.replaceAll(`{{ ${k} }}`, p);
        }

        core.setOutput("result", result);


    } catch (error) {
        core.setFailed(error.message);
    }
}

main();
