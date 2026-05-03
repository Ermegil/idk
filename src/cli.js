#!/usr/bin/env node

import { Command } from "commander";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name("opencode-rag")
  .description("CLI for Obsidian RAG with LM Studio")
  .version("0.1.0");

program
  .command("ingest")
  .description("Ingest Obsidian notes into vector database")
  .action(() => {
    console.log("📚 Starting ingestion...\n");
    const child = spawn("node", [join(__dirname, "ingest.js")], {
      stdio: "inherit",
      shell: true,
    });
    child.on("close", (code) => process.exit(code));
  });

program
  .command("search <query...>")
  .description("Search for relevant notes")
  .action((query) => {
    const child = spawn("node", [join(__dirname, "search.js"), ...query], {
      stdio: "inherit",
      shell: true,
    });
    child.on("close", (code) => process.exit(code));
  });

program
  .command("chat [query...]")
  .description("Chat with your Obsidian vault (RAG)")
  .action((query) => {
    const args = query ? query : [];
    const child = spawn("node", [join(__dirname, "chat.js"), ...args], {
      stdio: "inherit",
      shell: true,
    });
    child.on("close", (code) => process.exit(code));
  });

program
  .command("status")
  .description("Show system status")
  .action(async () => {
    console.log("🔍 Checking system status...\n");
    
    // Check LM Studio
    try {
      const config = await import("../config/config.json", { assert: { type: "json" } });
      const response = await fetch(`${config.default.lm_studio.base_url}/v1/models`);
      if (response.ok) {
        console.log("✅ LM Studio: Connected");
        const data = await response.json();
        console.log(`   Models available: ${data.data?.length || 0}`);
      } else {
        console.log("❌ LM Studio: Not reachable");
      }
    } catch (error) {
      console.log("❌ LM Studio: Not reachable");
    }

    console.log("\n📁 Obsidian Vault: ./data/obsidian");
    console.log("💾 Vector DB: Chroma (local)");
    console.log("\nRun 'opencode-rag ingest' to index your notes.");
  });

program.parse();
