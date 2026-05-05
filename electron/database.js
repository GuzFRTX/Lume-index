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
  db.prepare(`
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      name,
      path,
      extension UNINDEXED,
      size UNINDEXED,
      modified_at UNINDEXED
    )
  `).run();

  const filesCount = db.prepare(`SELECT COUNT(*) AS count FROM files`).get().count;
  const ftsCount = db.prepare(`SELECT COUNT(*) AS count FROM files_fts`).get().count;

  if (filesCount > 0 && ftsCount === 0) {
    db.prepare(`
      INSERT INTO files_fts (name, path, extension, size, modified_at)
      SELECT name, path, extension, size, modified_at
      FROM files
    `).run();
  }
}

const insertFileStatement = () =>
  db.prepare(`
    INSERT OR REPLACE INTO files 
    (name, path, extension, size, modified_at)
    VALUES (?, ?, ?, ?, ?)
  `);

const insertFtsStatement = () =>
  db.prepare(`
    INSERT INTO files_fts
    (name, path, extension, size, modified_at)
    VALUES (?, ?, ?, ?, ?)
  `);

export function resetFiles() {
  db.transaction(() => {
    db.prepare(`DELETE FROM files`).run();
    db.prepare(`DELETE FROM files_fts`).run();
  })();
}

export function insertFiles(files) {
  const insertFile = insertFileStatement();
  const insertFts = insertFtsStatement();

  db.transaction((nextFiles) => {
    for (const file of nextFiles) {
      insertFile.run(file.name, file.path, file.extension, file.size, file.modifiedAt);
      insertFts.run(file.name, file.path, file.extension, file.size, file.modifiedAt);
    }
  })(files);
}

export function replaceFiles(files) {
  resetFiles();
  insertFiles(files);
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

function escapeFtsToken(value) {
  return value.replace(/"/g, "").replace(/[^\p{L}\p{N}_-]+/gu, " ").trim();
}

function buildFtsQuery(query) {
  const tokens = escapeFtsToken(query)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);

  if (tokens.length === 0) return "";
  return tokens.map((token) => `"${token}"*`).join(" AND ");
}

export function searchFiles(query, options = {}) {
  const normalizedQuery = query.trim();
  const limit = Math.min(Math.max(Number(options.maxResults) || 100, 1), 500);

  if (normalizedQuery && !options.fuzzySearch) {
    const ftsQuery = buildFtsQuery(normalizedQuery);

    if (ftsQuery) {
      return db.prepare(`
        SELECT name, path, extension, size, modified_at
        FROM files_fts
        WHERE files_fts MATCH @query
        ORDER BY rank
        LIMIT @limit
      `).all({ query: ftsQuery, limit });
    }
  }

  const clauses = ["name LIKE @pattern ESCAPE '\\'"];
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
