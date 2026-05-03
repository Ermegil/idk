# Obsidian RAG

RAG (Retrieval-Augmented Generation) система для работы с заметками Obsidian, использующая LM Studio для эмбеддингов и чата, и Chroma DB как векторное хранилище.

## Требования

- **Node.js** >= 18.0.0
- **LM Studio** запущен с загруженной моделью
  - Embedding модель (для векторизации текста)
  - Chat модель (для генерации ответов)
- **Obsidian Vault** с вашими заметками

## Установка

```bash
npm install
npm link  # Для глобального доступа к CLI
```

## Настройка

1. Запустите **LM Studio** и загрузите модели:
   - Embedding модель (например, `nomic-embed-text`)
   - Chat модель (например, `Llama-3.2-3B-Instruct`)

2. Убедитесь, что LM Studio доступен на `http://localhost:1234`

3. Положите ваши `.md` файлы в папку `./data/obsidian`

4. При необходимости отредактируйте `config/config.json`:
   ```json
   {
     "lm_studio": {
       "base_url": "http://localhost:1234",
       "embedding_model": "local-model",
       "chat_model": "local-model"
     },
     "obsidian": {
       "vault_path": "./data/obsidian"
     }
   }
   ```

## Использование

### CLI (OpenCode)

```bash
# Проверка статуса системы
opencode-rag status

# Индексация заметок
opencode-rag ingest

# Поиск по заметкам
opencode-rag search "ваш запрос"

# Чат с заметками (RAG)
opencode-rag chat "ваш вопрос"
# или интерактивный режим
opencode-rag chat

# Управление заметками
opencode-rag edit read "Название заметки"        # Прочитать заметку
opencode-rag edit write "Название заметки"       # Создать/редактировать (интерактивно)
opencode-rag edit append "Заметка" "Текст"       # Добавить текст в конец
opencode-rag edit delete "Название заметки"      # Удалить заметку
```

### NPM скрипты

```bash
npm run status    # Проверка статуса
npm run ingest    # Индексация
npm run search "запрос"  # Поиск
npm run chat      # Интерактивный чат
npm run chat "вопрос"    # Единичный запрос
```

## Архитектура

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Obsidian      │────▶│   Ingest         │────▶│   Chroma    │
│   Notes (.md)   │     │   (chunking +    │     │   DB        │
│                 │     │    embedding)    │     │             │
└─────────────────┘     └──────────────────┘     └──────┬──────┘
                                                        │
┌─────────────────┐     ┌──────────────────┐           │
│   LM Studio     │◀────│   RAG Chat       │◀──────────┘
│   (Embed + LLM) │     │   (search +      │
│                 │     │    generate)     │
└─────────────────┘     └──────────────────┘
```

## Структура проекта

```
/workspace
├── src/
│   ├── cli.js        # OpenCode CLI
│   ├── ingest.js     # Индексация заметок
│   ├── search.js     # Семантический поиск
│   ├── chat.js       # RAG чат
│   └── edit.js       # Редактор заметок (read/write/append/delete)
├── config/
│   └── config.json   # Конфигурация
├── data/
│   ├── obsidian/     # Ваши .md файлы
│   └── chroma/       # Векторная БД (создается автоматически)
└── package.json
```

## Примеры

```bash
# Проиндексировать все заметки
opencode-rag ingest

# Найти заметки про React
opencode-rag search "React hooks"

# Спросить о чем-то с использованием контекста из заметок
opencode-rag chat "Как я организовал свои проекты?"
```

## Лицензия

MIT
