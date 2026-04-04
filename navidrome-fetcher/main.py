"""
FastAPI сервер для управления загрузками музыки
REST API для поиска на Rutracker и добавления в qBittorrent
"""
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
import json

from core.rutracker import RutrackerClient
from core.qbittorrent import QBittorrentClient
from config.settings import Config

# Инициализация приложения
app = FastAPI(
    title="Navidrome Music Fetcher",
    description="API для поиска и загрузки музыки с Rutracker в qBittorrent",
    version="1.0.0"
)

# Разрешаем CORS для доступа с телефона
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Глобальные клиенты (будут инициализированы при старте)
rutracker_client: Optional[RutrackerClient] = None
qbittorrent_client: Optional[QBittorrentClient] = None
config: Optional[Config] = None


def get_clients():
    """Получение клиентов (ленивая инициализация)"""
    global rutracker_client, qbittorrent_client, config
    
    if config is None:
        # Загрузка конфига из файла или переменных окружения
        config_file = "config.json"
        if os.path.exists(config_file):
            with open(config_file, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
            config = Config(**config_data)
        else:
            # Конфиг из переменных окружения
            config = Config(
                rutracker_username=os.getenv("RUTRACKER_USERNAME", ""),
                rutracker_password=os.getenv("RUTRACKER_PASSWORD", ""),
                qbittorrent_url=os.getenv("QBITTORRENT_URL", "http://localhost:8080"),
                qbittorrent_username=os.getenv("QBITTORRENT_USERNAME", "admin"),
                qbittorrent_password=os.getenv("QBITTORRENT_PASSWORD", "adminadmin"),
                download_path=os.getenv("DOWNLOAD_PATH", "C:/Music/Incoming"),
                min_seeds=int(os.getenv("MIN_SEEDS", "1"))
            )
    
    if rutracker_client is None:
        rutracker_client = RutrackerClient(
            username=config.rutracker_username,
            password=config.rutracker_password
        )
    
    if qbittorrent_client is None:
        qbittorrent_client = QBittorrentClient(
            url=config.qbittorrent_url,
            username=config.qbittorrent_username,
            password=config.qbittorrent_password
        )
    
    return rutracker_client, qbittorrent_client, config


class SearchRequest(BaseModel):
    query: str
    artist: Optional[str] = None
    album: Optional[str] = None


class TorrentResult(BaseModel):
    title: str
    seeds: int
    leeches: int
    size: str
    magnet: str
    topic_id: str


class DownloadRequest(BaseModel):
    magnet: str
    save_path: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    rutracker_connected: bool
    qbittorrent_connected: bool


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Проверка состояния сервиса"""
    rt_client, qb_client, _ = get_clients()
    
    rt_connected = rt_client.logged_in or rt_client.login()
    qb_connected = qb_client.test_connection()
    
    return HealthResponse(
        status="ok" if (rt_connected and qb_connected) else "degraded",
        rutracker_connected=rt_connected,
        qbittorrent_connected=qb_connected
    )


@app.post("/search", response_model=List[TorrentResult])
async def search_music(request: SearchRequest):
    """
    Поиск музыки на Rutracker
    """
    rt_client, _, cfg = get_clients()
    
    # Формируем запрос
    if request.artist and request.album:
        query = f"{request.artist} {request.album} FLAC"
    else:
        query = request.query
        if "FLAC" not in query.upper():
            query += " FLAC"
    
    results = rt_client.search(query, min_seeds=cfg.min_seeds)
    
    if not results:
        raise HTTPException(status_code=404, detail="Ничего не найдено")
    
    return [TorrentResult(**r) for r in results]


@app.post("/download")
async def download_torrent(request: DownloadRequest):
    """
    Добавить торрент в qBittorrent
    """
    _, qb_client, cfg = get_clients()
    
    save_path = request.save_path or cfg.download_path
    
    success = qb_client.add_torrent(
        magnet_link=request.magnet,
        save_path=save_path
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="Не удалось добавить торрент")
    
    return {"status": "ok", "message": "Торрент добавлен"}


@app.get("/torrents")
async def list_torrents(filter_status: Optional[str] = "all"):
    """
    Получить список активных загрузок
    """
    _, qb_client, _ = get_clients()
    
    torrents = qb_client.get_torrents(filter_status=filter_status)
    
    return {
        "count": len(torrents),
        "torrents": torrents
    }


@app.on_event("startup")
async def startup_event():
    """Инициализация при старте"""
    print("🚀 Navidrome Music Fetcher запускается...")
    rt_client, qb_client, cfg = get_clients()
    
    # Пробуем залогиниться на Rutracker
    if not rt_client.logged_in:
        rt_client.login()
    
    # Проверяем подключение к qBittorrent
    if not qb_client.authenticated:
        qb_client.login()
    
    print(f"📁 Путь загрузки: {cfg.download_path}")
    print(f"🔍 Минимум сидов: {cfg.min_seeds}")


if __name__ == "__main__":
    import uvicorn
    # Запуск сервера на всех интерфейсах (для доступа по Tailscale)
    uvicorn.run(app, host="0.0.0.0", port=8000)
