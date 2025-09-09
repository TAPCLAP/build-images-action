import 'source-map-support/register.js';
import * as core from '@actions/core';
import * as github from '@actions/github'
import { parse as yamlParse} from 'yaml';
import * as path from 'path';
import { Worker, isMainThread, workerData } from 'worker_threads';

// import {Util} from '@docker/actions-toolkit/lib/util';
import {generateRandomString, runCommand, createDir, getCurrentUtcTimestamp, normalizeRefName} from './lib.js';


async function main() {
  try {
    const context         = github.context;
    const registry        = core.getInput('registry');
    const githubToken     = core.getInput('github-token');
    const tag             = core.getInput('tag');
    const latest          = core.getInput('latest');
    let operation         = core.getInput('operation');
    const platforms       = core.getInput('platforms');
    const cacheFrom       = core.getInput('cache-from');
    const cacheTo         = core.getInput('cache-to');
    const ci              = core.getInput('ci');
    const ciTag           = core.getInput('ci-tag');
    let   repoName        = core.getInput('repo-name');
    const org             = context.payload.repository.owner.login.toLowerCase();
    const buildOpts       = yamlParse(core.getInput('build-opts'));
    const githubRegistry  = 'ghcr.io';

    const defaultRepoName = context.payload.repository.name.toLowerCase();
    const shortCommit     = context.sha.slice(0, 10);
    const refName         = normalizeRefName(context.ref);


    if (repoName === '' || registry == githubRegistry) {
      repoName = defaultRepoName;
    }
    repoName = repoName.toLowerCase();
    repoName = repoName.replaceAll('{{ repo }}', defaultRepoName);

    if (!isMainThread) {
      // Worker треды:
      const { image } = workerData;
      for (const cmd of image.push) {
        runCommand(cmd);
      }
      process.exit(0);
    }

    let resultTag = tag
    if (ci === 'true') {
      resultTag = ciTag;
      operation = 'build';
    }
    resultTag = resultTag.replaceAll("{{ commit }}", shortCommit);
    resultTag = resultTag.replaceAll("{{ dateTime }}", getCurrentUtcTimestamp());
    resultTag = resultTag.replaceAll("{{ ref }}", refName);


    core.setOutput('build-opts', core.getInput('build-opts'));
    console.log(`buildOpts: ${JSON.stringify(buildOpts, null, 2)}`);

    let imagesCommands = [];
    let outputBuiltImages = {};

    // prepare commands for build and push images
    for (const image of buildOpts) {
      if (!image.hasOwnProperty('operation')) {
        image['operation'] = 'build-and-push';
      }

      let buildTag = resultTag;
      if (image.operation === 'build') {
        buildTag = `0000001-${generateRandomString(8)}`;
      }

      let buildImage      = `${registry}/${repoName}/${image.name}:${buildTag}`;
      const buildTmpTag   = `${image.name}-${generateRandomString(8)}`;
      let prePushImageTag = `0000001-${generateRandomString(8)}`;
      let pushImage       = `${registry}/${repoName}/${image.name}:${resultTag}`;
      let pushImageLatest = `${registry}/${repoName}/${image.name}:latest`;
      let prePushImage    = `${registry}/${repoName}/${image.name}:${prePushImageTag}`;

      if (registry == githubRegistry) {
        buildImage      = `${registry}/${org}/${repoName}:${image.name}-${buildTag}`;
        pushImage       = `${registry}/${org}/${repoName}:${image.name}-${resultTag}`;
        pushImageLatest = `${registry}/${org}/${repoName}:${image.name}-latest`;
        prePushImage    = `${registry}/${org}/${repoName}:${image.name}-${prePushImageTag}`;
        prePushImageTag = `${image.name}-${prePushImageTag}`;
      }

      if ('repo-image-name' in image && image['repo-image-name'] === true) {
        buildImage      = `${registry}/${repoName}:${buildTag}`;
        pushImage       = `${registry}/${repoName}:${resultTag}`;
        pushImageLatest = `${registry}/${repoName}:latest`;
        prePushImage    = `${registry}/${repoName}:${prePushImageTag}`;

        if (registry == githubRegistry) {
          buildImage      = `${registry}/${org}/${repoName}:${buildTag}`;
          pushImage       = `${registry}/${org}/${repoName}:${resultTag}`;
          pushImageLatest = `${registry}/${org}/${repoName}:latest`;
          prePushImage    = `${registry}/${org}/${repoName}:${prePushImageTag}`;
        }
      }

      outputBuiltImages[image.name] = buildImage;

      const commands = {
        name: image.name,
        operation: image.operation,
        pushEnabled: true,
        tags: {
          build: buildImage,
          buildTmp: buildTmpTag,
          prePush: prePushImage,
          push: pushImage,
          pushLatest: pushImageLatest,
        }
      };

      if (image.operation !== 'push' && image.operation !== 'build-and-push') {
        commands['pushEnabled'] = false;
      }

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

      let secrets = '';
      if ('secrets' in image) {
        secrets = image.secrets.reduce((s,v) => {
          return s + ' --secret ' + '"' + v + '"';
        }, '');
      }

      if ('envs' in image) {
        for (const e of image.envs) {
          console.log('\x1b[34m%s\x1b[0m',`set env: "${e.name}"`);
          process.env[e.name] = e.value;
        }
      }

      let resultCacheFrom = cacheFrom;
      let originCacheFrom = '';
      if ('cache-from' in image) {
        resultCacheFrom = image['cache-from'];
      }
      if (resultCacheFrom != '') {
        originCacheFrom = resultCacheFrom;
        resultCacheFrom = `--cache-from ${resultCacheFrom}`;
      }

      let resultCacheTo = cacheTo;
      let originCacheTo = '';
      if ('cache-to' in image) {
        resultCacheTo = image['cache-to'];
      }
      if (resultCacheTo != '') {
        if (resultCacheTo.includes('type=gha')) {
          resultCacheTo = `${resultCacheTo},ghtoken=${githubToken}`;
        }
        originCacheTo = resultCacheTo;
        resultCacheTo = `--cache-to ${resultCacheTo}`;
      }

      let resultPlatforms = '';
      if (platforms != '') {
        resultPlatforms = platforms;
      }
      if ('platforms' in image) {
        resultPlatforms = image.platforms;
      }
      
      let multiPlatform = false;
      if (resultPlatforms.split(',').length > 1) {
        multiPlatform = true;
      }

      // latest
      let resultLatest = latest;
      if ('latest' in image) {
        resultLatest = image.latest;
      }
      if (resultLatest === 'true' || resultLatest === true) { 
        resultLatest = true;
      } else {
        resultLatest = false;
      }

      if ('copy-files' in image) {
        commands['copy-files'] = image['copy-files'];
      }

      // build image commands
      commands['build'] = [`docker buildx build ${file} ${args} ${secrets} --load ${resultCacheFrom} ${resultCacheTo} --tag ${buildImage} --tag ${buildTmpTag} ${target} .`];

      // pre push image commands
      commands['prePush'] = [
        `docker tag ${pushImage} ${prePushImage}`,
        `docker push ${prePushImage}`
      ];

      commands['push'] = [
        `docker push ${pushImage}`,
      ];

      if (resultLatest) {
        commands['push'].push(`docker tag ${pushImage} ${pushImageLatest}`);
        commands['push'].push(`docker push ${pushImageLatest}`);
      }

      if (multiPlatform) {
        
        let pushCacheFrom = resultCacheFrom;
        if (resultCacheFrom.includes('type=gha')) {
          pushCacheFrom = '';
        }
        let pushCacheTo = '';

        commands['build'] = [];

        // чтобы кешировать нужно билдить каждую платформу отдельно
        // https://github.com/docker/buildx/discussions/1382
        for (const p of resultPlatforms.split(',')) {
          if (resultCacheFrom.includes('type=gha')) {
            const scope     = p.replaceAll(/\//g, '-');
            resultCacheFrom = `--cache-from ${originCacheFrom},scope=image-${scope}`;
            pushCacheFrom   = `${pushCacheFrom} ${resultCacheFrom}`;
          }
          if (resultCacheTo.includes('type=gha')) {
            const scope   = p.replaceAll(/\//g, '-');
            resultCacheTo = `--cache-to ${originCacheTo},scope=image-${scope}`;
            pushCacheTo   = `${pushCacheTo} ${resultCacheTo}`;
          }
          commands['build'].push(`docker buildx build ${file} ${args} ${secrets} --platform ${p} --load ${resultCacheFrom} ${resultCacheTo} --tag ${buildImage} ${target} .`);
        }

        // create buildTmpTag for current platform. For run container if needed
        commands['build'].push(`docker buildx build ${file} ${args} ${secrets} --load --tag ${buildTmpTag} ${target} .`);
        outputBuiltImages[image.name] = buildTmpTag;

        commands['prePush'] = [`docker buildx build ${file} ${args} ${secrets} --platform ${resultPlatforms} --push ${pushCacheFrom} --tag ${prePushImage} ${target} .`];
        commands['push'] = [`docker buildx build ${file} ${args} ${secrets} --platform ${resultPlatforms} --push ${pushCacheFrom} --tag ${pushImage} ${target} .`];
        if (resultLatest) {
          commands['push'] = [`docker buildx build ${file} ${args} ${secrets} --platform ${resultPlatforms} --push ${pushCacheFrom} --tag ${pushImage} --tag ${pushImageLatest} ${target} .`];
        }
      }
      imagesCommands.push(commands);
    }

    // if (core.isDebug()) {
      console.log(`### imagesCommands struct: ###`);
      console.log(JSON.stringify(imagesCommands, null, 2));
    // }

    // Build images
    if (operation == 'build' || operation == 'build-and-push') {
      let copyFiles = [];
      createDir('copy-files');

      for (const image of imagesCommands) {
        console.log(`Build image: ${image.tags.build}`);
        
        // build
        for (const cmd of image.build) {
          runCommand(cmd);
        }

        // Copy files
        if ('copy-files' in image) {
          console.log(`Copy files from ${image.name} (${image.tags.build}, ${image.tags.buildTmp})`);
          const containerName = `copy-files-${generateRandomString(8)}`;

          runCommand(`docker run --name ${containerName} -d --entrypoint /bin/sleep ${image.tags.buildTmp} 30`);
          
          for(const file of image['copy-files']) {
            const toFile = path.basename(file);
            runCommand(`docker cp ${containerName}:${file} ./copy-files/${toFile}`);
            copyFiles.push(`./copy-files/${toFile}`);
          }
          runCommand(`docker rm -f ${containerName}`);
        }
      }

      core.setOutput('built-images', JSON.stringify(outputBuiltImages));
      core.setOutput('copy-files', JSON.stringify(copyFiles));
    }

    // push
    if (operation == 'push' || operation == 'build-and-push') {
      const pushImages = [];
      const allPushImages = [];
      // Сначала выполняем prePush для временных тегов, это нужно чтобы затем как можно быстрее и параллельно запушить итоговые теги (слои уже будут в registry и это пройдет быстрее). Это полезно для argocd-image-updater и flux image reflector, повысит вероятность, что новый тег будет обнаружен в образах за один проход

      for (const image of imagesCommands) {
        console.log(`${image.name} operation ${image.operation}`);
        if (!image.pushEnabled) {
          continue;
        }
        pushImages.push(image.tags.push);
        allPushImages.push(image.tags.push);
        allPushImages.push(image.tags.pushLatest);
        allPushImages.push(image.tags.prePush);

        for (const cmd of image.prePush) {
          runCommand(cmd);
        }
      }

      // паралельно пушим итоговые теги (сам пуш описан в начале кода в блоке if (!isMainThread) {})
      // а здесь лишь запуск тредов
      const workerScript = __filename;

      imagesCommands.forEach(image => {
        if (!image.pushEnabled) {
          return;
        }
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

      core.setOutput('pushed-images', JSON.stringify(pushImages, null, 2));
      // TODO  
      // core.setOutput('all-pushed-images', JSON.stringify(allPushImages));
      console.log('\x1b[34m%s\x1b[0m',`built images: ${JSON.stringify(pushImages, null, 2)}`);
      await core.summary
        .addHeading('Built images')
        .addCodeBlock(JSON.stringify(pushImages, null, 2), "json")
        .write()
    }
    

  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
