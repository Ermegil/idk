"""
Модуль для работы с Rutracker.org
Логин, поиск раздач, фильтрация по сидам и формату
"""
import requests
from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import re

class RutrackerClient:
    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.base_url = "https://rutracker.org"
        self.logged_in = False
    
    def login(self) -> bool:
        """Авторизация на РуТрекер"""
        try:
            # Загружаем страницу логина для получения токена
            login_page = self.session.get(f"{self.base_url}/forum/login.php")
            soup = BeautifulSoup(login_page.text, 'html.parser')
            
            # Ищем токен авторизации
            token_input = soup.find('input', {'name': 'sid'})
            if not token_input:
                print("Не удалось найти токен авторизации")
                return False
            
            sid = token_input.get('value')
            
            # Данные для входа
            login_data = {
                'login_username': self.username,
                'login_password': self.password,
                'sid': sid,
                'login': 'Вход'
            }
            
            # Отправляем форму входа
            response = self.session.post(
                f"{self.base_url}/forum/login.php",
                data=login_data,
                headers={
                    'Referer': f"{self.base_url}/forum/login.php",
                    'Origin': self.base_url
                }
            )
            
            # Проверяем успешность входа
            if "Вы входили последний раз" in response.text or self.username in response.text:
                self.logged_in = True
                print("Успешная авторизация на Rutracker")
                return True
            else:
                print("Ошибка авторизации")
                return False
                
        except Exception as e:
            print(f"Ошибка при входе: {e}")
            return False
    
    def search(self, query: str, min_seeds: int = 1) -> List[Dict]:
        """
        Поиск раздач по запросу
        Возвращает список раздач с информацией о названии, сидах, размере и magnet-ссылке
        """
        if not self.logged_in:
            if not self.login():
                return []
        
        results = []
        try:
            # Кодируем запрос для URL
            encoded_query = query.replace(' ', '+')
            search_url = f"{self.base_url}/forum/tracker.php?nm={encoded_query}"
            
            response = self.session.get(search_url)
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Ищем таблицу с результатами
            table = soup.find('table', {'class': 'tresults'})
            if not table:
                print("Результаты не найдены")
                return []
            
            # Обрабатываем каждую строку результата
            rows = table.find_all('tr', recursive=False)
            
            for row in rows[1:]:  # Пропускаем заголовок
                cells = row.find_all('td')
                if len(cells) < 5:
                    continue
                
                try:
                    # Название раздачи
                    title_cell = cells[2].find('a', class_='med tLink hl-tags bold')
                    if not title_cell:
                        title_cell = cells[2].find('a', class_='med tLink hl-tags')
                    if not title_cell:
                        continue
                    
                    title = title_cell.text.strip()
                    topic_id = title_cell['href'].split('=')[1] if '=' in title_cell['href'] else None
                    
                    if not topic_id:
                        continue
                    
                    # Сиды
                    seeds_cell = cells[6].find('b')
                    seeds = int(seeds_cell.text) if seeds_cell else 0
                    
                    # Личи
                    leeches_cell = cells[7].find('b')
                    leeches = int(leeches_cell.text) if leeches_cell else 0
                    
                    # Размер
                    size = cells[8].text.strip() if len(cells) > 8 else "N/A"
                    
                    # Фильтр по сидам
                    if seeds < min_seeds:
                        continue
                    
                    # Проверка на FLAC в названии
                    if 'FLAC' not in title.upper():
                        continue
                    
                    # Получаем magnet-ссылку (нужно зайти на страницу раздачи)
                    magnet = self._get_magnet_link(topic_id)
                    
                    if magnet:
                        results.append({
                            'title': title,
                            'seeds': seeds,
                            'leeches': leeches,
                            'size': size,
                            'magnet': magnet,
                            'topic_id': topic_id
                        })
                    
                except Exception as e:
                    print(f"Ошибка обработки строки: {e}")
                    continue
            
            # Сортируем по количеству сидов
            results.sort(key=lambda x: x['seeds'], reverse=True)
            
        except Exception as e:
            print(f"Ошибка поиска: {e}")
        
        return results
    
    def _get_magnet_link(self, topic_id: str) -> Optional[str]:
        """Получение magnet-ссылки со страницы раздачи"""
        try:
            page_url = f"{self.base_url}/forum/viewtopic.php?t={topic_id}"
            response = self.session.get(page_url)
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Ищем magnet-ссылку
            magnet_link = soup.find('a', href=lambda x: x and x.startswith('magnet:'))
            if magnet_link:
                return magnet_link['href']
            
            # Альтернативно: ищем кнопку "Скачать торрент" и формируем magnet
            # Для rutracker можно сформировать magnet из topic_id
            info_hash = self._get_info_hash(topic_id)
            if info_hash:
                return f"magnet:?xt=urn:btih:{info_hash}&dn={topic_id}"
            
        except Exception as e:
            print(f"Ошибка получения magnet: {e}")
        
        return None
    
    def _get_info_hash(self, topic_id: str) -> Optional[str]:
        """
        Получение info hash из .torrent файла
        Упрощенная реализация - в реальности нужно скачивать .torrent и парсить
        """
        # Это заглушка - для полноценной работы нужно скачивать торрент файл
        # и извлекать из него info_hash
        return None
