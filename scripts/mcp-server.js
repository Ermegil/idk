#!/usr/bin/env node

/**
 * MCP Server для работы с Obsidian + Chroma + LM Studio
 * Предоставляет инструменты для RAG-ассистента в OpenCode
 */

const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');
const matter = require('gray-matter');
const { v4: uuidv4 } = require('uuid');

// Конфигурация из переменных окружения
const OBSIDIAN_PATH = process.env.OBSIDIAN_PATH || './data/obsidian';
const CHROMA_PATH = process.env.CHROMA_PATH || './data/chroma_db';
const LMSTUDIO_URL = process.env.LMSTUDIO_URL || 'http://localhost:1234/v1';

let chromaClient = null;
let collection = null;

// Инициализация Chroma (ленивая загрузка)
async function initChroma() {
  if (chromaClient) return collection;
  
  try {
    const { ChromaClient } = await import('chromadb');
    chromaClient = new ChromaClient({ path: CHROMA_PATH });
    
    // Получить или создать коллекцию
    const collections = await chromaClient.listCollections();
    const exists = collections.find(c => c.name === 'obsidian-notes');
    
    if (exists) {
      collection = await chromaClient.getCollection({ name: 'obsidian-notes' });
    } else {
      collection = await chromaClient.createCollection({ name: 'obsidian-notes' });
    }
    
    console.error('[MCP] Chroma initialized successfully');
    return collection;
  } catch (error) {
    console.error('[MCP] Chroma initialization failed:', error.message);
    console.error('[MCP] Falling back to file-based search only');
    return null;
  }
}

// Поиск заметок через Chroma (семантический)
async function semanticSearch(query, limit = 5) {
  const coll = await initChroma();
  if (!coll) {
    return await keywordSearch(query, limit);
  }
  
  try {
    const results = await coll.query({
      queryTexts: [query],
      nResults: limit,
      include: ['documents', 'metadatas']
    });
    
    return results.documents[0].map((doc, i) => ({
      content: doc,
      metadata: results.metadatas[0][i],
      score: results.distances ? results.distances[0][i] : null
    }));
  } catch (error) {
    console.error('[MCP] Semantic search failed:', error.message);
    return await keywordSearch(query, limit);
  }
}

// Поиск по ключевым словам (резервный)
async function keywordSearch(query, limit = 5) {
  const files = await glob('**/*.md', { cwd: OBSIDIAN_PATH });
  const queryLower = query.toLowerCase();
  const results = [];
  
  for (const file of files.slice(0, 50)) { // Ограничение для производительности
    const filePath = path.join(OBSIDIAN_PATH, file);
    const content = await fs.readFile(filePath, 'utf-8');
    const contentLower = content.toLowerCase();
    
    // Простой подсчёт совпадений
    let score = 0;
    const queryWords = queryLower.split(/\s+/);
    for (const word of queryWords) {
      if (word.length > 2 && contentLower.includes(word)) {
        score++;
      }
    }
    
    if (score > 0) {
      results.push({
        content: content.substring(0, 1000) + (content.length > 1000 ? '...' : ''),
        metadata: { filename: file, path: filePath },
        score: score
      });
    }
  }
  
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Чтение заметки по имени файла
async function readNote(filename) {
  const filePath = path.join(OBSIDIAN_PATH, `${filename}.md`);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = matter(content);
    
    return {
      filename,
      content: parsed.content,
      frontmatter: parsed.data,
      exists: true
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { filename, exists: false, error: 'Заметка не найдена' };
    }
    throw error;
  }
}

// Создание или обновление заметки
async function writeNote(filename, content, mode = 'create', frontmatter = {}) {
  const filePath = path.join(OBSIDIAN_PATH, `${filename}.md`);
  
  let existingContent = '';
  let existingFrontmatter = {};
  
  if (mode === 'update' || mode === 'append') {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = matter(raw);
      existingContent = parsed.content;
      existingFrontmatter = parsed.data;
    } catch (error) {
      if (error.code === 'ENOENT' && mode === 'update') {
        throw new Error(`Заметка ${filename} не найдена для обновления`);
      }
    }
  }
  
  // Объединение frontmatter
  const mergedFrontmatter = {
    ...existingFrontmatter,
    ...frontmatter,
    updated: new Date().toISOString()
  };
  
  if (mode === 'create' && !mergedFrontmatter.created) {
    mergedFrontmatter.created = new Date().toISOString();
  }
  
  // Формирование итогового содержимого
  let finalContent = content;
  if (mode === 'append') {
    finalContent = existingContent + '\n\n' + content;
  }
  
  // Создание YAML frontmatter
  const yamlHeader = Object.keys(mergedFrontmatter).length > 0
    ? `---\n${Object.entries(mergedFrontmatter).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n')}\n---\n\n`
    : '';
  
  await fs.writeFile(filePath, yamlHeader + finalContent, 'utf-8');
  
  return {
    filename,
    path: filePath,
    mode,
    success: true
  };
}

// Удаление заметки
async function deleteNote(filename) {
  const filePath = path.join(OBSIDIAN_PATH, `${filename}.md`);
  
  try {
    await fs.unlink(filePath);
    return { filename, deleted: true };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { filename, deleted: false, error: 'Заметка не найдена' };
    }
    throw error;
  }
}

// Переиндексация всех заметок
async function reindex() {
  const coll = await initChroma();
  if (!coll) {
    return { 
      success: false, 
      error: 'Chroma недоступна. Индексация невозможна.',
      fallback: 'Поиск будет работать только по ключевым словам'
    };
  }
  
  try {
    // Очистка коллекции
    await coll.delete({ where: {} });
    
    const files = await glob('**/*.md', { cwd: OBSIDIAN_PATH });
    let indexed = 0;
    let errors = 0;
    
    for (const file of files) {
      try {
        const filePath = path.join(OBSIDIAN_PATH, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = matter(content);
        
        await coll.add({
          ids: [uuidv4()],
          documents: [parsed.content],
          metadatas: [{ filename: file, path: filePath }]
        });
        
        indexed++;
      } catch (error) {
        console.error(`[MCP] Error indexing ${file}:`, error.message);
        errors++;
      }
    }
    
    return {
      success: true,
      indexed,
      errors,
      total: files.length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Обработка запросов MCP
async function handleRequest(method, params) {
  switch (method) {
    case 'read_notes':
      return await semanticSearch(params.query, params.limit || 5);
    
    case 'read_note':
      return await readNote(params.filename);
    
    case 'write_note':
      return await writeNote(params.filename, params.content, params.mode, params.frontmatter);
    
    case 'delete_note':
      return await deleteNote(params.filename);
    
    case 'reindex':
      return await reindex();
    
    default:
      throw new Error(`Неизвестный метод: ${method}`);
  }
}

// Main loop для STDIN/STDOUT (MCP protocol)
async function main() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });
  
  rl.on('line', async (line) => {
    try {
      const request = JSON.parse(line);
      const response = await handleRequest(request.method, request.params);
      console.log(JSON.stringify({ result: response, id: request.id }));
    } catch (error) {
      console.log(JSON.stringify({ error: error.message, id: request?.id }));
    }
  });
  
  console.error('[MCP] Obsidian RAG Server started');
  console.error(`[MCP] Obsidian path: ${OBSIDIAN_PATH}`);
  console.error(`[MCP] Chroma path: ${CHROMA_PATH}`);
  console.error(`[MCP] LM Studio URL: ${LMSTUDIO_URL}`);
}

main().catch(console.error);
