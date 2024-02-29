import { execSync } from 'child_process';
import {existsSync, rmdirSync, mkdirSync} from 'fs';
// import fetch from 'node-fetch';


export function runCommand(command, exit = true) {
    try {
        console.log('\x1b[34m%s\x1b[0m',`run command: ${command}`);
        execSync(command, { stdio: 'inherit' });
      } catch (error) {
        console.error(`Command "${command}" failed with error: ${error.message}`);
        if (exit) {
            process.exit(1);
        }
    }
}

export function generateRandomString(length) {
    const characters = 'abcdefghijklmnopqrstuvwxyz';
    let randomString = '';

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        randomString += characters.charAt(randomIndex);
    }

    return randomString;
}

export function createDir(dir) {
    const folderPath = `./${dir}`;
    if (existsSync(folderPath)) {
        try {
            rmdirSync(folderPath, { recursive: true });
        } catch (err) {
            console.error(`Error deleting folder ${folderPath}: ${err.message}`);
            process.exit(1);
        }
    }
    
    try {
        mkdirSync(folderPath);
    } catch (err) {
        console.error(`Error creating folder ${folderPath}: ${err.message}`);
        process.exit(1);
    }
}

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
  
// export async function ghcrDeleteVersion(org, repo, token, version) {
//   const url = `https://api.github.com/orgs/${org}/packages/container/${repo}/versions`;
//   const options = {
//     method: 'GET',
//     headers: {
//       'Accept': 'application/vnd.github+json',
//       'Authorization': 'Bearer ' + token,
//       'X-GitHub-Api-Version': '2022-11-28',
//     },
//   };

//   const r = await makeRequest(url, options);
//   const f = r.filter((i) => i.metadata.container.tags.includes(version));
//   console.log(`Found ${f.length} versions for ${version}`);

//   if (f.length > 0) {
//     console.log(`Deleting versions for ${version}`);
//     for (v of f) {
//         console.log(`Deleting version ${v.id}`)
//         const url = `https://api.github.com/orgs/${org}/packages/container/${repo}/versions/${v.id}`;
//         const options = {
//             method: 'DELETE',
//             headers: {
//             'Accept': 'application/vnd.github+json',
//             'Authorization': 'Bearer ' + token,
//             'X-GitHub-Api-Version': '2022-11-28',
//             },
//         };
//         await makeRequest(url, options);
//         console.log(`Deleted version ${v.id} successfully`);
//     }
//   }
// }

