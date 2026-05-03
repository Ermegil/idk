import { Chroma } from "@langchain/community/vectorstores/chroma";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import matter from "gray-matter";
import { marked } from "marked";
import { glob } from "glob";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const config = require("../config/config.json");

class ObsidianLoader {
  constructor() {
    this.vaultPath = join(__dirname, "..", config.obsidian.vault_path);
    this.extensions = config.obsidian.extensions;
  }

  async loadNotes() {
    const documents = [];
    
    for (const ext of this.extensions) {
      const pattern = join(this.vaultPath, "**", `*${ext}`);
      const files = await glob(pattern);
      
      for (const file of files) {
        try {
          const content = await readFile(file, "utf-8");
          const { data, content: body } = matter(content);
          
          // Convert markdown to plain text (simple approach)
          const text = body;
          
          documents.push(
            new Document({
              pageContent: text,
              metadata: {
                source: file,
                frontmatter: data,
                title: data.title || file.split("/").pop().replace(ext, ""),
              },
            })
          );
        } catch (error) {
          console.error(`Error loading file ${file}:`, error.message);
        }
      }
    }
    
    return documents;
  }
}

class EmbeddingService {
  constructor() {
    this.baseUrl = config.lm_studio.base_url;
    this.model = config.lm_studio.embedding_model;
  }

  async embedDocuments(texts) {
    const embeddings = [];
    
    for (const text of texts) {
      try {
        const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            input: text,
          }),
        });
        
        if (!response.ok) {
          throw new Error(`Embedding API error: ${response.statusText}`);
        }
        
        const data = await response.json();
        embeddings.push(data.data[0].embedding);
      } catch (error) {
        console.error("Embedding error:", error.message);
        embeddings.push(new Array(384).fill(0)); // Fallback
      }
    }
    
    return embeddings;
  }

  async embedQuery(text) {
    const embeddings = await this.embedDocuments([text]);
    return embeddings[0];
  }
}

class ChromaLocalService {
  constructor() {
    this.documents = [];
  }

  async addDocuments(docs, embeddings) {
    docs.forEach((doc, i) => {
      this.documents.push({
        id: `doc_${this.documents.length}`,
        embedding: embeddings[i],
        metadata: doc.metadata,
        content: doc.pageContent,
      });
    });
  }

  async similaritySearch(queryEmbedding, topK = 5) {
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

  async save(path) {
    const fs = await import('fs');
    fs.writeFileSync(path, JSON.stringify(this.documents));
  }

  async load(path) {
    const fs = await import('fs');
    if (fs.existsSync(path)) {
      this.documents = JSON.parse(fs.readFileSync(path, 'utf-8'));
    }
  }
}

async function main() {
  console.log("📚 Loading Obsidian notes...");
  const loader = new ObsidianLoader();
  const documents = await loader.loadNotes();
  console.log(`✅ Loaded ${documents.length} notes`);

  console.log("🔪 Splitting documents...");
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.chunking.chunk_size,
    chunkOverlap: config.chunking.chunk_overlap,
  });
  const splits = await splitter.splitDocuments(documents);
  console.log(`✅ Created ${splits.length} chunks`);

  if (splits.length === 0) {
    console.log("⚠️  No documents to index.");
    return;
  }

  console.log("🔗 Generating embeddings...");
  const embeddingService = new EmbeddingService();
  const texts = splits.map(s => s.pageContent);
  const embeddings = await embeddingService.embedDocuments(texts);

  console.log("💾 Saving to local vector store...");
  const db = new ChromaLocalService();
  await db.addDocuments(splits, embeddings);
  
  const dbPath = join(__dirname, "..", config.chroma.persist_directory, "db.json");
  const fs = await import('fs');
  const dir = join(__dirname, "..", config.chroma.persist_directory);
  fs.mkdirSync(dir, { recursive: true });
  await db.save(dbPath);

  console.log("✅ Ingestion complete!");
  console.log(`   Collection: ${config.chroma.collection_name}`);
  console.log(`   Total chunks: ${splits.length}`);
  console.log(`   Saved to: ${dbPath}`);
}

main().catch(console.error);
