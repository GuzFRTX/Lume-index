import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";

let db;

export function initDb() {
  const dbPath = path.join(app.getPath("userData"), "file-indexer.db");

  db = new Database(dbPath);

  db.prepare(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      extension TEXT,
      size INTEGER,
      modified_at TEXT
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_files_name ON files(name)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)`).run();
}

const insertFileStatement = () =>
  db.prepare(`
    INSERT OR REPLACE INTO files 
    (name, path, extension, size, modified_at)
    VALUES (?, ?, ?, ?, ?)
  `);

export function replaceFiles(files) {
  const insertFile = insertFileStatement();

  const replaceAll = db.transaction((nextFiles) => {
    db.prepare(`DELETE FROM files`).run();

    for (const file of nextFiles) {
      insertFile.run(file.name, file.path, file.extension, file.size, file.modifiedAt);
    }
  });

  replaceAll(files);
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function buildSearchPattern(query, fuzzySearch) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) return "%";

  const escapedQuery = escapeLike(normalizedQuery);
  if (!fuzzySearch) return `%${escapedQuery}%`;

  return `%${[...escapedQuery].join("%")}%`;
}

export function searchFiles(query, options = {}) {
  const clauses = ["name LIKE @pattern ESCAPE '\\'"];
  const limit = Math.min(Math.max(Number(options.maxResults) || 100, 1), 500);
  const params = {
    pattern: buildSearchPattern(query, options.fuzzySearch),
    limit,
  };

  if (options.searchPaths) {
    clauses.push("path LIKE @pattern ESCAPE '\\'");
  }

  return db.prepare(`
    SELECT * FROM files
    WHERE ${clauses.join(" OR ")}
    ORDER BY modified_at DESC
    LIMIT @limit
  `).all(params);
}

export function isIndexedPath(filePath) {
  const row = db.prepare(`SELECT 1 FROM files WHERE path = ? LIMIT 1`).get(filePath);
  return Boolean(row);
}
