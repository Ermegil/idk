import os
from config import OBS_DIR
from utils import chunk_text
from embeddings import get_embedding
from chroma_setup import collection


def ingest_file(path):
    print(f"\n📄 processing {os.path.basename(path)}")

    try:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
    except Exception as e:
        print(f"❌ read error: {path} -> {e}")
        return

    chunks = chunk_text(text)

    added = 0

    for i, chunk in enumerate(chunks):
        emb = get_embedding(chunk)

        if emb is None:
            continue

        collection.add(
            embeddings=[emb],
            documents=[chunk],
            ids=[f"{path}::{i}"],
            metadatas=[{
                "source": path,
                "chunk_id": i
            }]
        )

        added += 1

    print(f"✔ added {added} chunks")


def ingest_folder(folder):
    for root, _, files in os.walk(folder):
        for file in files:

            # фильтр мусора
            if not file.endswith(".md"):
                continue

            # можно расширить потом
            path = os.path.join(root, file)

            ingest_file(path)


if __name__ == "__main__":
    ingest_folder(OBS_DIR)
    print("\n✅ ingestion done")