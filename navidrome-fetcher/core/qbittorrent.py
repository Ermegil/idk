"""
Модуль для работы с qBittorrent через Web API
Управление загрузками: добавление magnet-ссылок, мониторинг статуса
"""
import requests
from typing import Optional, Dict, List

class QBittorrentClient:
    def __init__(self, url: str, username: str, password: str):
        self.url = url.rstrip('/')
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.authenticated = False
    
    def login(self) -> bool:
        """Авторизация в qBittorrent Web UI"""
        try:
            login_url = f"{self.url}/api/v2/auth/login"
            data = {
                'username': self.username,
                'password': self.password
            }
            
            response = self.session.post(login_url, data=data)
            
            if response.status_code == 200 and response.text == 'Ok.':
                self.authenticated = True
                print("Успешная авторизация в qBittorrent")
                return True
            else:
                print(f"Ошибка авторизации в qBittorrent: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"Ошибка подключения к qBittorrent: {e}")
            return False
    
    def add_torrent(self, magnet_link: str, save_path: Optional[str] = None) -> bool:
        """
        Добавление торрента по magnet-ссылке
        """
        if not self.authenticated:
            if not self.login():
                return False
        
        try:
            upload_url = f"{self.url}/api/v2/torrents/add"
            data = {
                'urls': magnet_link,
                'autoTMM': 'false',
                'paused': 'false'
            }
            
            if save_path:
                data['savepath'] = save_path
            
            response = self.session.post(upload_url, data=data)
            
            if response.status_code == 200:
                print(f"Торрент добавлен: {magnet_link[:50]}...")
                return True
            else:
                print(f"Ошибка добавления торрента: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"Ошибка при добавлении торрента: {e}")
            return False
    
    def get_torrents(self, filter_status: Optional[str] = None) -> List[Dict]:
        """
        Получение списка торрентов
        filter_status: all, downloading, seeding, completed, paused, failed, active, inactive
        """
        if not self.authenticated:
            if not self.login():
                return []
        
        try:
            list_url = f"{self.url}/api/v2/torrents/info"
            params = {}
            
            if filter_status:
                params['filter'] = filter_status
            
            response = self.session.get(list_url, params=params)
            
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Ошибка получения списка торрентов: {response.status_code}")
                return []
                
        except Exception as e:
            print(f"Ошибка при получении списка торрентов: {e}")
            return []
    
    def pause_torrent(self, torrent_hash: str) -> bool:
        """Поставить торрент на паузу"""
        return self._torrent_action('pause', [torrent_hash])
    
    def resume_torrent(self, torrent_hash: str) -> bool:
        """Возобновить торрент"""
        return self._torrent_action('resume', [torrent_hash])
    
    def delete_torrent(self, torrent_hash: str, delete_files: bool = False) -> bool:
        """Удалить торрент"""
        if not self.authenticated:
            if not self.login():
                return False
        
        try:
            delete_url = f"{self.url}/api/v2/torrents/delete"
            data = {
                'hashes': torrent_hash,
                'deleteFiles': str(delete_files).lower()
            }
            
            response = self.session.post(delete_url, data=data)
            return response.status_code == 200
            
        except Exception as e:
            print(f"Ошибка удаления торрента: {e}")
            return False
    
    def _torrent_action(self, action: str, hashes: List[str]) -> bool:
        """Выполнить действие над торрентом (pause/resume)"""
        if not self.authenticated:
            if not self.login():
                return False
        
        try:
            action_url = f"{self.url}/api/v2/torrents/{action}"
            data = {'hashes': '|'.join(hashes)}
            
            response = self.session.post(action_url, data=data)
            return response.status_code == 200
            
        except Exception as e:
            print(f"Ошибка действия {action}: {e}")
            return False
    
    def test_connection(self) -> bool:
        """Проверка подключения к qBittorrent"""
        return self.login()
