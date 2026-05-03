import { Chroma } from "@langchain/community/vectorstores/chroma";
import { createRequire } from "module";
import { readFileSync } from "fs";

const require = createRequire(import.meta.url);
const config = require("../config/config.json");

class EmbeddingService {
  constructor() {
    this.baseUrl = config.lm_studio.base_url;
    this.model = config.lm_studio.embedding_model;
  }

  async embedDocuments(texts) {
    const embeddings = [];
    for (const text of texts) {
      const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, input: text }),
      });
      const data = await response.json();
      embeddings.push(data.data[0].embedding);
    }
    return embeddings;
  }

  async embedQuery(text) {
    const embeddings = await this.embedDocuments([text]);
    return embeddings[0];
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

  // Step 1: Search for relevant context
  const embeddingService = new EmbeddingService();
  const vectorStore = new Chroma(embeddingService, {
    collectionName: config.chroma.collection_name,
    url: config.lm_studio.base_url.replace("/v1", ""),
  });

  const results = await vectorStore.similaritySearch(query, 3);
  
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
