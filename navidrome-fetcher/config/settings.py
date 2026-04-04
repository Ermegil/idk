# Конфигурация приложения
from pydantic import BaseModel

class Config(BaseModel):
    # Rutracker credentials
    rutracker_username: str = ""
    rutracker_password: str = ""
    
    # qBittorrent Web UI settings
    qbittorrent_url: str = "http://localhost:8080"
    qbittorrent_username: str = "admin"
    qbittorrent_password: str = "adminadmin"
    
    # Download path on server (where Navidrome scans)
    download_path: str = "C:/Music/Incoming"
    
    # Minimum seeds required
    min_seeds: int = 1
    
    # Search query format
    search_format: str = "{artist} {album} FLAC"
