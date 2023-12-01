import * as core from '@actions/core';
import * as github from '@actions/github'
import { parse as yamlParse} from 'yaml';
import * as path from 'path';
import { Worker, isMainThread, workerData } from 'worker_threads';

// import {Util} from '@docker/actions-toolkit/lib/util';
import {generateRandomString, runCommand, createDir, deleteDockerImageTag} from './lib.js';


async function main() {
  try {
    const context    = github.context;
    const registry   = core.getInput('registry');
    const tag        = core.getInput('tag');
    const operation  = core.getInput('operation');
    const repoName   = context.payload.repository.name.toLowerCase();
    const buildOpts  = yamlParse(core.getInput('build-opts'));

    if (!isMainThread) {
      // Worker треды:
      const { image } = workerData;
      runCommand(`docker push ${image}`);
      process.exit(0);
    }

    core.setOutput('build-opts', core.getInput('build-opts'));
    console.log(`buildOpts: ${JSON.stringify(buildOpts, null, 2)}`);
    
    // Build images
    if (operation == 'build' || operation == 'build-and-push') {
      let copyFiles = [];
      createDir('copy-files');

      for (const image of buildOpts) {

        const imageTag = `${registry}/${repoName}/${image.name}:${tag}`;
        console.log(`Build image: ${imageTag}`);

        let args = '';
        if ('args' in image) {
          args = image.args.reduce((a,v) => {
            return a + ' --build-arg ' + v.name + '=' + "'" + v.value + "'";
          }, '');
        }

        let target = '';
        if ('target' in image) {
          target = `--target ${image.target}`;
        }

        let file = `--file ./docker/${image.name}/Dockerfile`;
        if ('file' in image) {
          file = `--file ${image.file}`;
        }

        // build image
        runCommand(`docker build ${file} ${args} --tag ${imageTag} ${target} .`);

        // Copy files
        if ('copy-files' in image) {
          console.log(`Copy files from ${image.name} (${imageTag})`);
          const containerName = `copy-files-${generateRandomString(8)}`;

          runCommand(`docker run --name ${containerName} -d --entrypoint /bin/sleep ${imageTag} 30`);
          
          for(const file of image['copy-files']) {
            const toFile = path.basename(file);
            runCommand(`docker cp ${containerName}:${file} ./copy-files/${toFile}`);
            copyFiles.push(`./copy-files/${toFile}`);
          }
          runCommand(`docker rm -f ${containerName}`);
        }
      }

      core.setOutput('copy-files', JSON.stringify(copyFiles));
    }

    // push
    if (operation == 'push' || operation == 'build-and-push') {
      let images = [];

      // Сначала выполняем prePush для временных тегов, это нужно чтобы затем как можно быстрее и параллельно запушить итоговые теги (слои уже будут в registry и это пройдет быстрее). Это полезно для argocd-image-updater и flux image reflector, это повысит вероятность, что новый тег будет обнаружен в образах за один проход

      let prePushImages = [];
      for (const image of buildOpts) {
        const imageTag        = `${registry}/${repoName}/${image.name}:${tag}`;
        const prePushTag      = `0000001-${generateRandomString(8)}`;
        const imagePrePushTag = `${registry}/${repoName}/${image.name}:${prePushTag}`;

        runCommand(`docker tag ${imageTag} ${imagePrePushTag}`);
        runCommand(`docker push ${imagePrePushTag}`);
        images.push(imageTag);
        prePushImages.push({
          registry: `https://${registry}`,
          repo: `${repoName}/${image.name}`,
          tag: prePushTag,
        })
      }

      // паралельно пушим итоговые теги (сам пуш описан в начале кода в блоке if (!isMainThread) {})
      // а здесь лишь запуск тредов
      const workerScript = __filename;
    
      images.forEach(image => {
        const worker = new Worker(workerScript, { workerData: { image } });
        worker.on('error', (error) => {
          console.error(`Worker for image ${image} encountered an error: ${error.message}`);
          process.exit(1);
        });
        worker.on('exit', (code) => {
          if (code !== 0) {
            console.error(`Worker for image ${image} exited with code ${code}`);
            process.exit(1);
          }
        });
      });

      core.setOutput('pushed-images', JSON.stringify(images));
      await core.summary
        .addHeading('Built images')
        .addCodeBlock(JSON.stringify(images, null, 2), "json")
        .write()
    }
    

  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
