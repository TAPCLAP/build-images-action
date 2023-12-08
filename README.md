# build images action

Собирает docker образы.

## Примеры

### Сборка двух образов nginx и server

Dockerfile'ы должны находится в одноименных папках в директории `docker`. Другими словами такое вот расположение
```
./docker/server/Dockerfile
./docker/nginx/Dockerfile
```
Также образу `server` нужно передать аргументы `GITHUB_USER` и `GITHUB_TOKEN`. Имена езультирующих образов будут сформированы по следующему принципу: `<registry>/<repo-name>/<image-name>:<tag>`, где `<repo-name>` - имя репозитория в нижнем регистре.

```yaml
- id: set-tags
  run: |
    commit_sha=${{ github.sha }}
    commit_sha=${commit_sha:0:10}
    time=`date +%Y%m%d%H%M`

    echo "tag=${{ inputs.area }}-${{ inputs.platform }}-${time}-${{ github.ref_name }}-${commit_sha}" >> $GITHUB_OUTPUT
# nosemgrep
- uses: orangeappsru/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: ${{ steps.set-tags.outputs.tag }}
    operation: build-and-push
    build-opts: |
      - name: sever
        args:
          - name: GITHUB_USER
            value: ${{ github.repository_owner }}
          - name: GITHUB_TOKEN
            value: ${{ secrets.COMMON_TOKEN }}
      - name: nginx
```

### Разделение шагов сборки и пуша в registry и копирование файлов из образов

Бывает необходимо скопировать файл из собранного образа и выполнить какие-то с ним действия:
```yaml
- id: set-tags
  run: |
    commit_sha=${{ github.sha }}
    commit_sha=${commit_sha:0:10}
    time=`date +%Y%m%d%H%M`

    echo "tag=${{ inputs.area }}-${{ inputs.platform }}-${time}-${{ github.ref_name }}-${commit_sha}" >> $GITHUB_OUTPUT
# nosemgrep
- uses: orangeappsru/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: ${{ steps.set-tags.outputs.tag }}
    operation: build
    build-opts: |
      - name: server
        copy-files: ['/app/junit.xml']
        args:
          - name: GITHUB_USER
            value: ${{ github.repository_owner }}
          - name: GITHUB_TOKEN
            value: ${{ secrets.COMMON_TOKEN }}
      - name: nginx-server

- name: check copy files
  run: |
    files="${{ join(fromJSON(steps.build-images.outputs.copy-files), ' ') }}"
    for i in $files;
    do
      cat $i
    done

# nosemgrep
- uses: orangeappsru/build-images-action@main
  id: push-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: ${{ steps.set-tags.outputs.tag }}
    operation: push
    build-opts: ${{ steps.build-images.outputs.build-opts }}
```

### Сборка нескольких образов из одного Dockerfile но с разными target
```yaml
- id: set-tags
  run: |
    commit_sha=${{ github.sha }}
    commit_sha=${commit_sha:0:10}
    time=`date +%Y%m%d%H%M`

    echo "tag=${{ inputs.area }}-${{ inputs.platform }}-${time}-${{ github.ref_name }}-${commit_sha}" >> $GITHUB_OUTPUT
# nosemgrep
- uses: orangeappsru/build-images-action@main
  id: build-images
  with:
    registry: ${{ vars.REGISTRY }}
    registry-user: ${{ secrets.REGISTRY_USER }}
    registry-password: ${{ secrets.REGISTRY_PASSWORD }}
    tag: ${{ steps.set-tags.outputs.tag }}
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
      - uses: orangeappsru/build-images-action@main
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

## Inputs

### `registry`
registry, указывать без протокола (например `example.com/registry`)

### `registry-user`
Пользователь для аутентификации в registry

### `registry-password`
Пароль для аутентификации в reigstry

### `tag`
Тег образов

### `operation`
Может быть равен `build`, `push`, `build-and-push`. Если равен `build`, то будут собраны образы, но не запушены в registry. Если `push` то action будет просто пушить образы (ожидается что для указанного тега образы собраны). `build-and-push` сразу билдит образы и пушит их

### `build-opts`
Принимает структуру данных в yaml формате следующего вида:
```yaml
- name: <image1>
  target: t1
  file: ./docker/<image1>/Dockerfile
  args:
    - name: arg1
      value: val2
    - name: arg2
      value: val2
    - ...
    - name: argn
      value: argn
  copy-files: ['path/to/file1', 'path/to/file2', ..., 'path/to/filen']
- name: <image2>:
  target: t1
  file: ./docker/<image2>/Dockerfile
  args:
    - name: arg1
      value: val2
    - name: arg2
      value: val2
    - ...
    - name: argn
      value: argn
  copy-files: ['path/to/file1', 'path/to/file2', ..., 'path/to/filen']
...
- name: <imagen>
...
```
Структура представляет из себя массив, где каждый элемент это образ и дополнительные параметры к нему.

* `name` - образ который требуется собрать. 

* `args` (опционально) - список аргументов  
* `copy-files` (опционально) - файлы которые требуется скопировать из образа после сборки  
* `target` (опционально) - если указано то добавляется `--target target-value` в команду сборки
* `file` (опционально) - если указано то в `--file` подставляется значение из этого поля

## Outputs 

### `copy-files`

Список файлов в JSON формате: `["path/to/file1", "path/to/file2", ...]`, пути до файлов, которые были скопированы из контейнеров указанные в опции `copy-files` для образов в `build-opts`.

### `pushed-images`

Список запушенных в registry образов в JSON формате: `["example.com/registry/image1:tag", "example.com/registry/image2:tag", ...]`

### `built-images`

Собранные образы в JSON формате: `{"image1": "example.com/registry/image1:tag", "image2": "example.com/registry/image2:tag", ...}`
Это удобно использовать если далее в пайплайне потребуется запустить контейнер из собранного образа
```yaml
      - uses: orangeappsru/build-images-action@main
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