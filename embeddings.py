import requests
from config import EMBED_URL, EMBED_MODEL
import logging

logger = logging.getLogger(__name__)

def get_embedding(text: str):
    try:
        r = requests.post(
            EMBED_URL,
            json={
                "model": EMBED_MODEL,
                "input": text
            },
            timeout=60
        )

        r.raise_for_status()
        data = r.json()

        # LM Studio иногда отдаёт "data" как массив
        if "data" in data:
            return data["data"][0]["embedding"]

        # Ollama стиль
        if "embedding" in data:
            return data["embedding"]

        raise ValueError(f"Unknown embedding format: {data}")

		except requests.exceptions.Timeout:
			logger.error("Embedding request timeout")
			return None
		except requests.exceptions.ConnectionError:
			logger.error("Cannot connect to embedding server")
			return None
		except Exception as e:
			logger.error(f"Embedding error: {e}")
			return None