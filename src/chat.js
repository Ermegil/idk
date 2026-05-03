import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { createRequire } from "module";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const config = require("../config/config.json");

class ChromaLocalService {
  constructor() {
    this.documents = [];
  }

  async load(path) {
    const fs = await import('fs');
    if (fs.existsSync(path)) {
      this.documents = JSON.parse(fs.readFileSync(path, 'utf-8'));
    }
  }

  async similaritySearchWithEmbedding(queryEmbedding, topK = 5) {
    const scored = this.documents.map(doc => ({
      ...doc,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));
    
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, topK).map(doc => ({
      pageContent: doc.content,
      metadata: { ...doc.metadata, score: doc.score },
    }));
  }

  cosineSimilarity(a, b) {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dot / (normA * normB || 1);
  }
}

class EmbeddingService {
  constructor() {
    this.baseUrl = config.lm_studio.base_url;
    this.model = config.lm_studio.embedding_model;
  }

  async embedQuery(text) {
    try {
      const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, input: text }),
      });
      if (!response.ok) throw new Error("LM Studio not reachable");
      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.log("⚠️  LM Studio unavailable. Using keyword search fallback.");
      return null;
    }
  }
}

class ChatService {
  constructor() {
    this.baseUrl = config.lm_studio.base_url;
    this.model = config.lm_studio.chat_model;
  }

  async chat(messages) {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: -1,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}

async function ragChat(query) {
  console.log(`🤔 Thinking about: "${query}"\n`);

  // Load database
  const dbPath = join(__dirname, "..", config.chroma.persist_directory, "db.json");
  const db = new ChromaLocalService();
  await db.load(dbPath);

  if (db.documents.length === 0) {
    console.log("⚠️  No documents in database. Run 'opencode-rag ingest' first.");
    return;
  }

  // Step 1: Get embedding and search
  const embeddingService = new EmbeddingService();
  const queryEmbedding = await embeddingService.embedQuery(query);
  
  let results;
  if (queryEmbedding) {
    results = await db.similaritySearchWithEmbedding(queryEmbedding, 3);
  } else {
    // Fallback to keyword search
    const keywords = query.toLowerCase().split(/\s+/);
    const scored = db.documents.map(doc => {
      const content = doc.content.toLowerCase();
      const matches = keywords.filter(k => content.includes(k)).length;
      return { ...doc, score: matches / keywords.length };
    });
    scored.sort((a, b) => b.score - a.score);
    results = scored.slice(0, 3).map(doc => ({
      pageContent: doc.content,
      metadata: { ...doc.metadata, score: doc.score },
    }));
  }
  
  if (results.length === 0) {
    console.log("⚠️  No relevant documents found.");
    return;
  }

  // Step 2: Build context from search results
  const context = results
    .map((doc, i) => `[Source ${i + 1}: ${doc.metadata.title}]\n${doc.pageContent}`)
    .join("\n\n---\n\n");

  console.log(`📚 Found ${results.length} relevant sources\n`);

  // Step 3: Generate response with RAG
  const systemPrompt = `You are a helpful assistant that answers questions based on the provided context from Obsidian notes. 
If the answer is not in the context, say so clearly. Always cite your sources by mentioning the note title.

Context:
${context}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ];

  const chatService = new ChatService();
  const response = await chatService.chat(messages);

  console.log("💬 Response:\n");
  console.log(response);
  console.log("\n");
  
  return response;
}

// Interactive CLI
async function main() {
  console.log("🤖 Obsidian RAG Chat (Ctrl+C to exit)\n");
  
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (query) =>
    new Promise((resolve) => rl.question(query, resolve));

  try {
    while (true) {
      const input = await askQuestion("> ");
      if (!input.trim() || input.toLowerCase() === "exit") break;
      await ragChat(input.trim());
    }
  } finally {
    rl.close();
  }
}

// Check if query provided as argument
const args = process.argv.slice(2);
if (args.length > 0) {
  ragChat(args.join(" ")).catch(console.error);
} else {
  main().catch(console.error);
}
