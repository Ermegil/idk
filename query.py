import requests
from embeddings import get_embedding
from chroma_setup import collection
from config import LLM_URL, LLM_MODEL


# ---------- LLM ----------
def ask_llm(context: str, question: str):
    messages = [
        {
            "role": "system",
            "content": (
                "Ты помощник по базе знаний. "
                "Отвечай ТОЛЬКО по предоставленному контексту. "
                "Если в контексте нет информации — скажи, что данных нет."
            )
        },
        {
            "role": "user",
            "content": f"""
Контекст:
{context}

Вопрос:
{question}
"""
        }
    ]

    r = requests.post(
        LLM_URL,
        json={
            "model": LLM_MODEL,
            "messages": messages,
            "temperature": 0.2
        },
        timeout=120
    )

    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


# ---------- MAIN LOOP ----------
while True:
    q = input("\n🔎 > ")

    # 1. embedding запроса
    q_emb = get_embedding(q)

    if q_emb is None:
        print("❌ embedding failed")
        continue

    # 2. vector search
    results = collection.query(
        query_embeddings=[q_emb],
        n_results=5
    )

    docs = results.get("documents", [[]])[0]
    distances = results.get("distances", [[]])[0]

    # 3. фильтр мусора (самое важное улучшение)
    filtered = []
    for doc, dist in zip(docs, distances):
        if dist is not None and dist < 0.75:
            filtered.append(doc)

    # fallback если всё отфильтровалось
    if not filtered:
        filtered = docs[:2]

    context = "\n\n---\n\n".join(filtered)

    # 4. debug вывод
    print("\n--- RESULTS ---")
    print(context)
    print("--------------")

    # 5. LLM ответ
    answer = ask_llm(context, q)

    print("\n🤖", answer)