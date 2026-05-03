import { glob } from "glob";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname, parse } from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const config = require("../config/config.json");

class ObsidianEditor {
  constructor() {
    this.vaultPath = join(__dirname, "..", config.obsidian.vault_path);
  }

  async findNote(title) {
    const files = await glob(join(this.vaultPath, "**", "*.md"));
    
    for (const file of files) {
      const content = await readFile(file, "utf-8");
      const { data } = matter(content);
      
      if (data.title?.toLowerCase() === title.toLowerCase() || 
          parse(file).name.toLowerCase() === title.toLowerCase()) {
        return file;
      }
    }
    
    return null;
  }

  async readNote(identifier) {
    let filePath = identifier;
    
    // Если это не полный путь, ищем по названию
    if (!identifier.includes("/") && !identifier.includes("\\")) {
      filePath = await this.findNote(identifier);
      if (!filePath) {
        throw new Error(`Note "${identifier}" not found`);
      }
    } else if (!filePath.endsWith(".md")) {
      filePath = await this.findNote(identifier);
      if (!filePath) {
        filePath = join(this.vaultPath, identifier);
        if (!filePath.endsWith(".md")) filePath += ".md";
      }
    }

    const content = await readFile(filePath, "utf-8");
    const { data, content: body } = matter(content);
    
    return {
      path: filePath,
      frontmatter: data,
      content: body,
    };
  }

  async writeNote(identifier, content, frontmatter = {}) {
    let filePath = identifier;
    
    // Если это не полный путь, ищем по названию или создаем новую
    if (!identifier.includes("/") && !identifier.includes("\\")) {
      const existing = await this.findNote(identifier);
      if (existing) {
        filePath = existing;
      } else {
        filePath = join(this.vaultPath, `${identifier}.md`);
      }
    }

    // Создаем директорию если нужно
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });

    // Формируем final content с frontmatter
    const hasFrontmatter = Object.keys(frontmatter).length > 0;
    let finalContent = content;
    
    if (hasFrontmatter) {
      finalContent = matter.stringify(content, frontmatter);
    }

    await writeFile(filePath, finalContent, "utf-8");
    
    return filePath;
  }

  async appendToFile(identifier, content, section = null) {
    const note = await this.readNote(identifier);
    
    let newContent = note.content;
    
    if (section) {
      // Добавляем в конкретную секцию
      const sectionHeader = `## ${section}`;
      if (newContent.includes(sectionHeader)) {
        newContent = newContent.replace(
          new RegExp(`(${sectionHeader}\\n[\\s\\S]*?)(\\n##|$)`),
          `$1\n${content}\n$2`
        );
      } else {
        newContent += `\n\n${sectionHeader}\n\n${content}`;
      }
    } else {
      newContent += `\n\n${content}`;
    }

    await writeFile(note.path, matter.stringify(newContent, note.frontmatter), "utf-8");
    
    return note.path;
  }

  async deleteNote(identifier) {
    const fs = await import('fs');
    let filePath = identifier;
    
    if (!identifier.includes("/") && !identifier.includes("\\")) {
      filePath = await this.findNote(identifier);
      if (!filePath) {
        throw new Error(`Note "${identifier}" not found`);
      }
    }

    fs.unlinkSync(filePath);
    return filePath;
  }
}

async function main() {
  const editor = new ObsidianEditor();
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
📝 Obsidian Editor

Usage:
  opencode-rag edit read <note>       - Read a note
  opencode-rag edit write <note>      - Write a note (interactive)
  opencode-rag edit append <note>     - Append content to a note
  opencode-rag edit delete <note>     - Delete a note

Examples:
  opencode-rag edit read "My Note"
  opencode-rag edit write "New Note"
  opencode-rag edit append "My Note" "Some content"
  opencode-rag edit delete "Old Note"
`);
    return;
  }

  const command = args[0];
  const noteName = args[1];
  const content = args.slice(2).join(" ");

  try {
    switch (command) {
      case "read":
        if (!noteName) {
          console.error("Please specify a note name");
          process.exit(1);
        }
        const note = await editor.readNote(noteName);
        console.log(`📄 Reading: ${note.path}\n`);
        if (Object.keys(note.frontmatter).length > 0) {
          console.log("Frontmatter:", JSON.stringify(note.frontmatter, null, 2));
          console.log("\n---\n");
        }
        console.log(note.content);
        break;

      case "write":
        if (!noteName) {
          console.error("Please specify a note name");
          process.exit(1);
        }
        
        const readline = await import("readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const askQuestion = (query) =>
          new Promise((resolve) => rl.question(query, resolve));

        console.log(`✏️  Writing to: ${noteName}`);
        console.log("(Enter content, then type 'END' on a new line to finish)\n");

        const lines = [];
        rl.on("line", (line) => {
          if (line === "END") {
            rl.close();
          } else {
            lines.push(line);
          }
        });

        rl.on("close", async () => {
          const content = lines.join("\n");
          const filePath = await editor.writeNote(noteName, content, { title: noteName, created: new Date().toISOString() });
          console.log(`✅ Saved to: ${filePath}`);
        });
        break;

      case "append":
        if (!noteName || !content) {
          console.error("Please specify a note name and content");
          process.exit(1);
        }
        const appendedPath = await editor.appendToFile(noteName, content);
        console.log(`✅ Appended to: ${appendedPath}`);
        break;

      case "delete":
        if (!noteName) {
          console.error("Please specify a note name");
          process.exit(1);
        }
        const deletedPath = await editor.deleteNote(noteName);
        console.log(`✅ Deleted: ${deletedPath}`);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
