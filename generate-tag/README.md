# generate tag action

На вход передается шаблон с параметрами. На выходе отрендеренная строка. 

## Примеры

```yaml
# nosemgrep
- uses: tapclap/build-images-action/generate-tag@main
  id: tag
  with:
    template: "{{ area }}-{{ dateTime }}-{{ ref }}-{{ commit }}"
    params: |
      area: ${{ inputs.area }}

- run: |
    echo '${{ steps.tag.outputs.result }}'
```

Есть стандартные шаблонные строки, которые автоматически заменяются и их не требуется указывать в параметрах. Например `dateTime`. Ниже в описании параметра `params` они все описаны.

## Inputs

### `template`
**Required** 
```
default: нет
```
Шаблон строки

### `params`
**Required** 
```
default: нет
```
Параметры, передаваемые в шаблон.

#### Стандартные шаблоны
1. `{{ dateTime }}` - автоматически заменяется на текущее время в UTC в формате `YYYYMMDDhhmm`
1. `{{ ref }}` - заменяется на `github.ref_name`
1. `{{ commit }}` - заменяется на `github.sha`, но только в short версии (первые 10 символов)

## Outputs

### `result`
Результат рендера строки
