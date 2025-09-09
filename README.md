# build images action

Собирает docker образы.

## Примеры

### Сборка двух образов nginx и server

Dockerfile'ы должны находится в одноименных папках в директории `docker`. Другими словами такое вот расположение
```
./docker/server/Dockerfile
./docker/nginx/Dockerfile
```
Также образу `server` нужно передать аргументы `PLATFORM` и `ENV`. Имена результирующих образов будут сформированы по следующему принципу: `<registry>/<repo-name>/<image-name>:<tag>`, где `<repo-name>` - имя репозитория в нижнем регистре.

```yaml
# nosemgrep
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: ${{ inputs.area }}-{{ dateTime }}-{{ ref }}-{{ commit }}
    operation: build-and-push
    build-opts: |
      - name: server
        args:
          - name: PLATFORM
            value: ${{ inputs.platform }}
          - name: ENV
            value: ${{ inputs.env }}
      - name: nginx
```

В поле tag поддерживается небольшая шаблонизация ([подробности](#tag))

Если в качестве registry будет передан ghcr.io, то имена образов будут формироваться по следующему принципу: `ghcr.io/<org-name>/<repo-name>:<image-name>-<tag>`:
```yaml
# nosemgrep
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ghcr.io
    registry-user: ${{ github.repository_owner }}
    registry-password: ${{ secrets.GITHUB_TOKEN }}
    tag: ${{ inputs.area }}-{{ dateTime }}-{{ ref }}-{{ commit }}
    operation: build-and-push
    build-opts: |
      - name: server
        args:
          - name: PLATFORM
            value: ${{ inputs.platform }}
          - name: ENV
            value: ${{ inputs.env }}
      - name: nginx
```
Будут собраны образы:  
1. `ghcr.io/org-name/repo-name:server-<tag>`
1. `ghcr.io/org-name/repo-name:nginx-<tag>`

### Разделение шагов сборки и пуша в registry и копирование файлов из образов

Бывает необходимо скопировать файл из собранного образа и выполнить какие-то с ним действия:
```yaml
# nosemgrep
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: ${{ inputs.area }}-{{ dateTime }}-{{ ref }}-{{ commit }}
    operation: build
    build-opts: |
      - name: server
        copy-files: ['/app/junit.xml']
        args:
          - name: PLATFORM
            value: ${{ inputs.platform }}
          - name: ENV
            value: ${{ inputs.env }}
      - name: nginx-server

- name: check copy files
  run: |
    files="${{ join(fromJSON(steps.build-images.outputs.copy-files), ' ') }}"
    for i in $files;
    do
      cat $i
    done

# nosemgrep
- uses: tapclap/build-images-action@main
  id: push-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: ${{ inputs.area }}-{{ dateTime }}-{{ ref }}-{{ commit }}
    operation: push
    build-opts: ${{ steps.build-images.outputs.build-opts }}
```

### Сборка нескольких образов из одного Dockerfile но с разными target
```yaml
# nosemgrep
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: ${{ inputs.area }}-{{ dateTime }}-{{ ref }}-{{ commit }}
    operation: build-and-push
    build-opts: |
      - name: php
        file: ./docker/Dockerfile
        target: php
      - name: migrations
        file: ./docker/Dockerfile
        target: migrations
```

### Если нужно запустить собранный контенйер после билда
Action возвращает output `built-images`, который можно использовать для запуска только что собранных контейнеров:
```yaml
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: latest
    operation: build
    build-opts: |
      - name: native-builder
- name: test
  env:
    IMAGE: ${{ fromJson(steps.build-images.outputs.built-images).native-builder }}
  run: |
    docker run --rm -v $(pwd):/app --workdir /app ${IMAGE} ./build.sh
```

### Прокидываем секреты
Если хотим использовать функцию https://docs.docker.com/build/building/secrets/, то нужно передать поле `secrets`

docker secrets поддерживает возможность передавать секреты через енвы, поэтому  предусмотрено поле `envs`, которое позволяет создать перменные среды перед запуском `docker build` чтобы прокинуть их в секреты `type=env`
```yaml
# nosemgrep
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ghcr.io
    registry-user: ${{ github.repository_owner }}
    registry-password: ${{ secrets.GITHUB_TOKEN }}
    tag: ${{ inputs.area }}-{{ dateTime }}-{{ ref }}-{{ commit }}
    operation: build-and-push
    build-opts: |
      - name: server
        envs:
        - name: GITHUB_USER
          value: ${{ github.repository_owner }}
        - name: GITHUB_TOKEN
          value: ${{ secrets.COMMON_TOKEN }}
        secrets:
        - id=GITHUB_USER,type=env,env=GITHUB_USER
        - id=GITHUB_TOKEN,type=env,env=GITHUB_TOKEN
```

```dockerfile
RUN --mount=type=secret,id=GITHUB_USER,env=GITHUB_USER \
    --mount=type=secret,id=GITHUB_TOKEN,env=GITHUB_TOKEN \
    make build
```
Второй пример

```yaml
- uses: tapclap/build-images-action@main
  name: build native
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: ${{ inputs.area }}-{{ ref }}
    operation: build
    build-opts: |
      - name: android
        copy-files: ['/output']
        envs:
        - name: ANDROID_KEYSTORE_PASSWORD
          value: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
        - name: ANDROID_KEYSTORE_ALIAS
          value: ${{ secrets.ANDROID_KEYSTORE_ALIAS }}
        secrets:
        - id=ANDROID_KEYSTORE,type=file,src=./android.keystore
        - id=ANDROID_KEYSTORE_PASSWORD,type=env,env=ANDROID_KEYSTORE_PASSWORD
        - id=ANDROID_KEYSTORE_ALIAS,type=env,env=ANDROID_KEYSTORE_ALIAS
        - id=SUPPLY_JSON_KEY,type=file,src=./google_play_key.json
        args:
        - name: AREA
          value: ${{ inputs.area }}
        - name: VERSION_NAME
          value: ${{ github.ref_name }}
        - name: BACKEND_URL
          value: ${{ inputs.backend-url }}
```
В примере мы прокидываем секреты `ANDROID_KEYSTORE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEYSTORE_ALIAS`, `SUPPLY_JSON_KEY`, где `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEYSTORE_ALIAS` пробрасываются через переменные среды, а  `ANDROID_KEYSTORE`, `SUPPLY_JSON_KEY` пробрасываются через файлы. 
В Dockerfile использовать секреты можно таким образом

```dockerfile
RUN --mount=type=secret,id=ANDROID_KEYSTORE \
    --mount=type=secret,id=ANDROID_KEYSTORE_PASSWORD,env=ANDROID_KEYSTORE_PASSWORD \
    --mount=type=secret,id=ANDROID_KEYSTORE_ALIAS,env=ANDROID_KEYSTORE_ALIAS \
    --mount=type=secret,id=SUPPLY_JSON_KEY \
       export ANDROID_KEYSTORE=/run/secrets/ANDROID_KEYSTORE \
    && export SUPPLY_JSON_KEY=/run/secrets/SUPPLY_JSON_KEY \
    make build
```
Подробнее смотрите в документации по docker secrets: https://docs.docker.com/build/building/secrets/

### Указываем несколько платформ для билда
указываем `platforms` для сборки всех образов
```yaml
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: latest
    operation: build-and-push
    platforms: linux/amd64,linux/arm64
    build-opts: |
      - name: image
```

указываем `platforms` для определенного образа
```yaml
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: build-and-push
    operation: build
    build-opts: |
      - name: image1
        platforms: linux/amd64,linux/arm64
      - name: image2
```

###  latest тег
Иногда хочется помимо указанного тега сделать так чтобы пушился ещё latest тег. Для этого просто добавляем параметр `latest: true`

```yaml
# nosemgrep
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: ${{ inputs.area }}-{{ dateTime }}-{{ ref }}-{{ commit }}
    operation: build-and-push
    latest: true
    build-opts: |
      - name: server
        args:
          - name: PLATFORM
            value: ${{ inputs.platform }}
          - name: ENV
            value: ${{ inputs.env }}
      - name: nginx
```

Тоже самое можно делать на уровне образа в `build-opts`
```yaml
# nosemgrep
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: ${{ inputs.area }}-{{ dateTime }}-{{ ref }}-{{ commit }}
    operation: build-and-push
    build-opts: |
      - name: server
        args:
          - name: PLATFORM
            value: ${{ inputs.platform }}
          - name: ENV
            value: ${{ inputs.env }}
      - name: nginx
        latest: true
```

### cache
Можно использовать cache-from и cache-to

```yaml
# nosemgrep
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: ${{ inputs.area }}-{{ dateTime }}-{{ ref }}-{{ commit }}
    operation: build-and-push
    cache-from: type=gha
    cache-to: type=gha,mode=max
    build-opts: |
      - name: server
        args:
          - name: PLATFORM
            value: ${{ inputs.platform }}
          - name: ENV
            value: ${{ inputs.env }}
      - name: nginx
```

Если будет использоваться ghcr.io, то в случае нескольких образов latest тег будет запушен следующим образом: `ghcr.io/<org-name>/<repo-name>:<image-name>-latest`

### образ = имени репозитория

Чтобы пушить образ с именем репы без дополнительных постфиксов, то есть таким образом
1. `<registry>/<repo-name>:<tag>`
1. `ghcr.io/<org-name>/<repo-name>:<tag>`

можно воспользоваться опцией `repo-image-name`

```yaml
# nosemgrep
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: ${{ inputs.area }}-{{ dateTime }}-{{ ref }}-{{ commit }}
    operation: build-and-push
    build-opts: |
      - name: server
        repo-image-name: true
        args:
          - name: PLATFORM
            value: ${{ inputs.platform }}
          - name: ENV
            value: ${{ inputs.env }}
      - name: nginx
```

Будут собраны образы

1. `<registry>/<repo-name>:<tag>` - server
1. `<registry>/<repo-name>/nginx:<tag>` - nginx

### меняем имя репозитория
Обычно имя образа формируется по принципу: `<registry>/<repo-name>/<image-name>:<tag>`, где `<repo-name>` - имя репозитория в нижнем регистре. Если передать параметр `repo-name` то эта часть в имени будет замененеа на указанное значение (тоже в нижнем регистре).

```yaml
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: latest
    operation: build-and-push
    repo-name: override/repo-name
    build-opts: |
      - name: server
```
В результате будет сформировано такое имя: ``<registry>/override/repo-name/server:latest`

В случае использования стандартного registry `ghcr.io` эта опция не на что не влияет. `repo-name` будет равен имени репозитория.

Параметр поддерживает небольшую шаблоинзацию:
```yaml
- uses: tapclap/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: latest
    operation: build-and-push
    repo-name: '{{ repo }}/override'
    build-opts: |
      - name: server
```

В результате будет сформировано такое имя: ``<registry>/repo-name/override/server:latest`


### CI

Часто возникает задача просто собрать образы для проверок в CI. Их обычно пушить не требуется и также какие-то особые теги выставлять не нужно. Поэтому приходится добавлять логику в workflow для разных режимов его запска, и указывать разные теги в зависимости от входных параметров. Например:

```yaml
    - name: vars
      id: vars
      run: |
        set -x
        commit_sha=${{ github.sha }}
        commit_sha=${commit_sha:0:10}
        echo "commit_sha=${commit_sha}" >> $GITHUB_OUTPUT
        time=`date -u +%Y%m%d%H%M`

        platform="${{ inputs.app_platform }}"
        if [[ ${{ inputs.custom_tag_platform }} != 'default' ]]; then
          platform="${{ inputs.custom_tag_platform }}"
        fi

        tag="${{ inputs.app_env }}-manual-${time}-${{ github.ref_name }}-${commit_sha}"
        operation='build-and-push'

        if [[ ${{ inputs.ci }} == "true" ]]; then
          tag="${commit_sha}"
          operation='build'
        fi

        echo "operation=${operation}" >> $GITHUB_OUTPUT
        echo "tag=${tag}" >> $GITHUB_OUTPUT
        echo "platform=${platform}" >> $GITHUB_OUTPUT


    # nosemgrep
    - uses: tapclap/build-images-action@main
      id: build-images
      with:
        registry: ${{ vars.REGISTRY }}
        registry-user: ${{ secrets.REGISTRY_USER }}
        registry-password: ${{ secrets.REGISTRY_PASSWORD }}
        tag: ${{ steps.vars.outputs.tag }}
        operation: ${{ steps.vars.outputs.operation }}
        repo-name: '{{ repo }}/${{ steps.vars.outputs.platform }}'
        build-opts: |
          - name: server
          - name: web
          - name: remote
          - name: fbinstant-deploy
            args:
              - name: AREA
                value: ${{ inputs.app_env }}
              - name: REF
                value: ${{ github.ref_name }}
```
Но это можно упростить просто выставив параметр `ci` в `true`:

```yaml
    - name: vars
      id: vars
      run: |
        set -x
        platform="${{ inputs.app_platform }}"
        if [[ ${{ inputs.custom_tag_platform }} != 'default' ]]; then
          platform="${{ inputs.custom_tag_platform }}"
        fi

        echo "platform=${platform}" >> $GITHUB_OUTPUT

    # nosemgrep
    - uses: tapclap/build-images-action@main
      id: build-images
      with:
        registry: ${{ vars.REGISTRY }}
        registry-user: ${{ secrets.REGISTRY_USER }}
        registry-password: ${{ secrets.REGISTRY_PASSWORD }}
        ci: ${{ inputs.ci }}
        tag: '${{ inputs.app_env }}-manual-{{ dateTime }}-${{ ref }}-{{ commit }}'
        operation: build-and-push
        repo-name: '{{ repo }}/${{ steps.vars.outputs.platform }}'
        build-opts: |
          - name: server
          - name: web
          - name: remote
          - name: fbinstant-deploy
            args:
              - name: AREA
                value: ${{ inputs.app_env }}
              - name: REF
                value: ${{ github.ref_name }}
```
когда мы выставляем `ci` равным `true`, action не пушит образы (то есть operation считай что равен `build`), а tag будет равен short sha коммита. tag можно менять через опцию `ci-tag`.

### аргументы поддерживают шаблонизацию

Также как и в тегах можно использовать шаблоны в аргументах сборки образа

```yaml
    # nosemgrep
    - uses: tapclap/build-images-action@main
      id: build-images
      with:
        registry: ${{ vars.REGISTRY }}
        registry-user: ${{ secrets.REGISTRY_USER }}
        registry-password: ${{ secrets.REGISTRY_PASSWORD }}
        tag: '${{ inputs.app_env }}-manual-{{ dateTime }}-${{ ref }}-{{ commit }}'
        operation: build-and-push
        build-opts: |
          - name: fbinstant-deploy
            args:
              - name: AREA
                value: ${{ inputs.app_env }}
              - name: REF
                value: '{{ ref }}'
              - name: REF
                value: '{{ commit }}'
```



## Inputs

### `registry`
registry, указывать без протокола (например `example.com/registry`)

### `registry-user`
Пользователь для аутентификации в registry

### `registry-password`
Пароль для аутентификации в reigstry

### `tag`
Тег образов. Поддерживает небольшую шаблонизацию:

1. `{{ commit }}` -  short sha коммита
1. `{{ dateTime }}` - дата и время в UTC в формате `YYYYMMDDhhmm` 
1. `{{ ref }}` - имя ветки или тега (без refs/heads)

Пример: `tag: '${{ inputs.area }}-{{ dateTime }}-{{ ref }}-{{ commit }}'`


### `operation`
Может быть равен `build`, `push`, `build-and-push`. Если равен `build`, то будут собраны образы, но не запушены в registry. Если `push` то action будет просто пушить образы (ожидается что для указанного тега образы собраны). `build-and-push` сразу билдит образы и пушит их

### `platforms`
`default: ''`
Список платформ которые будут подставляться в команду сборки через аргумент `--platform`. Платформы должны перичислены через запятую. Пример: `linux/amd64,linux/arm64`. Документация https://docs.docker.com/build/building/multi-platform/. Этот параметр может быть переопределен на уровне образа в `build-opts`.

### `latest`
`default: false`
Пушить дополнительно latest тег или нет. Этот параметр может быть переопределен на уровне образа в `build-opts`.

### `repo-name`
`default: ''`
Перезаписывает часть имени образа куда подставляется имя репозитория: `<registry>/<repo-name>/<image-name>:<tag>`. Если указать эту опцию то будет заменена часть `<repo-name>`. Поддерживается небольшая шаблонизация:

1. `{{ repo }}` - имя текущего репозитория (без owner'а или организации)

В случае использования стандартного registry `ghcr.io` эта опция не на что не влияет. `repo-name` будет равен имени репозитория.

### `ci`
`default: 'false'`
Если равен `'true'`, `operation` принудительно выставляется в `build`, а tag выставляется в `ci-tag`

### `ci-tag`
`default: '{{ commit }}'`

Используется вместо `tag` когда `ci` равен `true`. Поддерживает аналогичную шаблонизацию

1. `{{ commit }}` -  short sha коммита
1. `{{ dateTime }}` - дата и время в UTC в формате `YYYYMMDDhhmm` 
1. `{{ ref }}` - имя ветки или тега (без refs/heads)


### `build-opts`
Принимает структуру данных в yaml формате следующего вида:
```yaml
- name: <image1>
  target: t1
  file: ./docker/<image1>/Dockerfile
  platforms: linux/amd64,linux/arm64
  latest: false
  repo-image-name: false
  args:
    - name: arg1
      value: val2
    - name: arg2
      value: val2
    - ...
    - name: argn
      value: argn
  copy-files: ['path/to/file1', 'path/to/file2', ..., 'path/to/filen']
  envs:
    - name: VAR1
      value: VAL1
    - name: VAR2
      value: VAL2
  secrets:
    - id=FILE,type=file,src=./file
    - id=VAR1,type=env,env=VAR1
    - id=VAR2,type=env,env=VAR2

- name: <image2>:
  target: t1
  file: ./docker/<image2>/Dockerfile
  platforms: linux/amd64,linux/arm64
  latest: false
  repo-image-name: false
  args:
    - name: arg1
      value: val2
    - name: arg2
      value: val2
    - ...
    - name: argn
      value: argn
    - name: commit
      value: '{{ commit }}'
    - name: ref
      value: '{{ ref }}'
  copy-files: ['path/to/file1', 'path/to/file2', ..., 'path/to/filen']
  envs:
    - name: VAR1
      value: VAL1
    - name: VAR2
      value: VAL2
  secrets:
    - id=FILE,type=file,src=./file
    - id=VAR1,type=env,env=VAR1
    - id=VAR2,type=env,env=VAR2
...
- name: <imagen>
...
```
Структура представляет из себя массив, где каждый элемент это образ и дополнительные параметры к нему.

* `name` - образ который требуется собрать. 

* `args` (опционально) - список аргументов. Поддерживает шаблонизацию как в тегах ([подробности](#tag))
* `copy-files` (опционально) - файлы которые требуется скопировать из образа после сборки  
* `target` (опционально) - если указано то добавляется `--target target-value` в команду сборки
* `file` (опционально) - если указано то в `--file` подставляется значение из этого поля
* `envs` (опционально) - создает указанные переменные среды перед запуском сборки, полезно при использовании совместно с `secrets`
* `secrets` (опционально) - добавляет аргументы `--secret`. Подробнее смотрите в докумнтации docker: https://docs.docker.com/build/building/secrets/
* `platforms` (опционально) - добавляет в аргументы сборки `--platform platforms`. Платформы должны перичислены через запятую. Пример: `linux/amd64,linux/arm64`. Документация https://docs.docker.com/build/building/multi-platform/
* `latest` (опционально) - пушить дополнительно latest тег или нет
* `repo-image-name` (опциноально) - пушит образ под именем репозитория

## Outputs 

### `copy-files`

Список файлов в JSON формате: `["path/to/file1", "path/to/file2", ...]`, пути до файлов, которые были скопированы из контейнеров указанные в опции `copy-files` для образов в `build-opts`.

### `pushed-images`

Список запушенных в registry образов в JSON формате: `["example.com/registry/image1:tag", "example.com/registry/image2:tag", ...]`

### `built-images`

Собранные образы в JSON формате: `{"image1": "example.com/registry/image1:tag", "image2": "example.com/registry/image2:tag", ...}`
Это удобно использовать если далее в пайплайне потребуется запустить контейнер из собранного образа
```yaml
      - uses: tapclap/build-images-action@main
        id: build-images
        with:
          registry: ${{ vars.REGISTRY }}
          registry-user: ${{ secrets.REGISTRY_USER }}
          registry-password: ${{ secrets.REGISTRY_PASSWORD }}
          tag: latest
          operation: build
          build-opts: |
            - name: native-builder
      - name: test
        env:
          IMAGE: ${{ fromJson(steps.build-images.outputs.built-images).native-builder }}
        run: |
          docker run --rm -v $(pwd):/app --workdir /app ${IMAGE} ./build.sh
```


### `build-opts`

Проброс в outputs того же самого что пришло в одноименную опцию в inputs