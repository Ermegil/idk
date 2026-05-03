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
    const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: text }),
    });
    const data = await response.json();
    return data.data[0].embedding;
  }
}

async function search(query, topK = 5) {
  console.log(`🔍 Searching for: "${query}"\n`);

  const dbPath = join(__dirname, "..", config.chroma.persist_directory, "db.json");
  const db = new ChromaLocalService();
  await db.load(dbPath);

  if (db.documents.length === 0) {
    console.log("⚠️  No documents in database. Run 'ingest' first.");
    return [];
  }

  const embeddingService = new EmbeddingService();
  let queryEmbedding;
  
  try {
    queryEmbedding = await embeddingService.embedQuery(query);
  } catch (error) {
    console.log("⚠️  Could not get embedding from LM Studio. Using keyword search instead.");
    // Fallback to simple keyword search
    const keywords = query.toLowerCase().split(/\s+/);
    const scored = db.documents.map(doc => {
      const content = doc.content.toLowerCase();
      const matches = keywords.filter(k => content.includes(k)).length;
      return { ...doc, score: matches / keywords.length };
    });
    scored.sort((a, b) => b.score - a.score);
    
    const results = scored.slice(0, topK).map(doc => ({
      pageContent: doc.content,
      metadata: { ...doc.metadata, score: doc.score },
    }));
    
    console.log(`✅ Found ${results.length} relevant chunks:\n`);
    results.forEach((doc, i) => {
      console.log(`--- Result ${i + 1} ---`);
      console.log(`Source: ${doc.metadata.source}`);
      console.log(`Title: ${doc.metadata.title}`);
      console.log(`Score: ${doc.metadata.score?.toFixed(2) || "N/A"}`);
      console.log(`Content: ${doc.pageContent.substring(0, 200)}...\n`);
    });
    
    return results;
  }

  const results = await db.similaritySearchWithEmbedding(queryEmbedding, topK);

  console.log(`✅ Found ${results.length} relevant chunks:\n`);
  
  results.forEach((doc, i) => {
    console.log(`--- Result ${i + 1} ---`);
    console.log(`Source: ${doc.metadata.source}`);
    console.log(`Title: ${doc.metadata.title}`);
    console.log(`Score: ${doc.metadata.score?.toFixed(2) || "N/A"}`);
    console.log(`Content: ${doc.pageContent.substring(0, 200)}...\n`);
  });

  return results;
}

// CLI usage
const query = process.argv.slice(2).join(" ");
if (!query) {
  console.error("Usage: npm run search -- <your query>");
  process.exit(1);
}

search(query).catch(console.error);
