# Navidrome Music Fetcher

Сервер для поиска и загрузки музыки с Rutracker в qBittorrent через REST API.

## Что умеет

- 🔍 Поиск раздач на Rutracker.org по названию/артисту/альбому
- 🎯 Фильтрация по формату FLAC и количеству сидов
- ⬇️ Автоматическая отправка magnet-ссылок в qBittorrent
- 🌐 REST API для доступа с телефона (через Tailscale)

## Требования

- Python 3.8+
- qBittorrent с включенным веб-интерфейсом
- Аккаунт на Rutracker.org

## Установка

### 1. Настройка qBittorrent

1. Открой qBittorrent → Настройки → Веб-интерфейс
2. Поставь галочку "Включить веб-интерфейс"
3. Задай порт (по умолчанию 8080)
4. Придумай логин и пароль
5. Сохрани настройки

### 2. Установка зависимостей

```bash
pip install -r requirements.txt
```

### 3. Конфигурация

Скопируй пример конфига:

```bash
copy config.json.example config.json
```

Отредактируй `config.json`:

```json
{
  "rutracker_username": "твой_логин_от_rutracker",
  "rutracker_password": "твой_пароль_от_rutracker",
  "qbittorrent_url": "http://localhost:8080",
  "qbittorrent_username": "admin",
  "qbittorrent_password": "твой_пароль_qbittorrent",
  "download_path": "C:/Music/Incoming",
  "min_seeds": 1
}
```

**Важно:** `download_path` — это папка, куда qBittorrent будет качать музыку. 
Укажи здесь путь, который сканирует Navidrome (или подпапку в нём).

## Запуск

```bash
python main.py
```

Сервер запустится на порту 8000 и будет доступен по всем сетевым интерфейсам.

## Доступ через Tailscale

Если у тебя установлен Tailscale:

1. Узнай Tailscale IP сервера: `tailscale ip`
2. С телефона подключайся к `http://<tailscale-ip>:8000`

## API Endpoints

### GET /health
Проверка статуса сервиса

### POST /search
Поиск музыки
```json
{
  "query": "Pink Floyd Dark Side of the Moon",
  "artist": "Pink Floyd",
  "album": "Dark Side of the Moon"
}
```

### POST /download
Добавить торрент в загрузку
```json
{
  "magnet": "magnet:?xt=urn:btih:...",
  "save_path": "C:/Music/Incoming"
}
```

### GET /torrents
Получить список активных загрузок

## Пример использования с телефона

1. Открой браузер на телефоне
2. Перейди на `http://<tailscale-ip>:8000/docs` (Swagger UI)
3. Используй `/search` для поиска
4. Выбери раздачу и отправь magnet через `/download`

## Примечания

- Для работы с Rutracker нужен активный аккаунт
- Скрипт автоматически фильтрует раздачи без FLAC в названии
- Минимальное количество сидов настраивается в конфиге
- После загрузки не забудь переместить файлы в основную библиотеку Navidrome (или настрой автоимпорт)
