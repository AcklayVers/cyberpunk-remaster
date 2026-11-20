# Установка и обновления через GitHub

Репозиторий: https://github.com/AcklayVers/cyberpunk-remaster

Постоянный манифест Foundry: https://github.com/AcklayVers/cyberpunk-remaster/releases/latest/download/module.json

Скачать последний ZIP: https://github.com/AcklayVers/cyberpunk-remaster/releases/latest/download/cyberpunk-remaster.zip

Все выпуски: https://github.com/AcklayVers/cyberpunk-remaster/releases

В Foundry откройте «Дополнительные модули» → «Установить модуль», вставьте постоянный манифест в поле Manifest URL и установите модуль. Для последующих версий используйте проверку обновлений модулей в меню настройки Foundry. Новая версия появляется после успешной сборки GitHub Actions.

## Для последующих правок

Рабочая папка этого модуля: `C:/Users/AcklayVers/Documents/ChatGPT/Библиотека импланта/cyberpunk-remaster`.

После завершённой правки увеличьте версию командой `python tools/set-version.py НОВАЯ_ВЕРСИЯ`, обновите CHANGELOG, выполните проверки, добавьте нужные файлы в Git и соберите проверочный ZIP:

```text
python -m unittest discover -s tools -p test_release.py
python tools/release.py --repository AcklayVers/cyberpunk-remaster --output dist
git commit -m "Описание исправления"
git push origin main
```

Для Remaster перед публикацией также выполните `npm test`. Все изменения нужного выпуска должны быть добавлены через `git add` до проверки ZIP. Полные правила находятся в AGENTS.md.

Push в main запускает `.github/workflows/release.yml`. Проверки выполняются автоматически. Затем GitHub публикует версию `vX.Y.Z` с тремя файлами: `module.json`, `cyberpunk-remaster.zip`, `SHA256SUMS`. Манифест содержит постоянную ссылку обновления и ZIP именно своей версии. Опубликованные версии не перезаписываются. Если версия не увеличена, новый выпуск не создаётся.

GitHub не получает текст чата автоматически: работающий в чате агент должен завершать правки commit/push, как указано в AGENTS.md. Постоянно работающий локальный наблюдатель не требуется.
