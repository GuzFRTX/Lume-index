import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb, isIndexedPath, replaceFiles, searchFiles } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const imageMimeTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"],
  [".avif", "image/avif"],
]);
const defaultMaxPreviewMb = 15;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0f0f14",
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "renderer", "index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5173");
  }
}

app.whenReady().then(() => {
  initDb();
  createWindow();
});

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });

  if (result.canceled) return null;
  return result.filePaths[0];
});

function normalizeExtension(value) {
  const extension = value.trim().toLowerCase();
  if (!extension) return "";
  return extension.startsWith(".") ? extension : `.${extension}`;
}

function parseList(value, fallback = []) {
  if (typeof value !== "string") return fallback;

  const items = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
}

function createIndexOptions(options = {}) {
  const ignoredNames = new Set(parseList(options.excludedPatterns, ["node_modules", ".git", "AppData", "Windows", "Program Files"]));
  const indexedExtensions = new Set(parseList(options.indexedExtensions).map(normalizeExtension).filter(Boolean));

  return {
    followShortcuts: Boolean(options.followShortcuts),
    includeHidden: Boolean(options.includeHidden),
    ignoredNames,
    indexedExtensions,
  };
}

function isHiddenName(name) {
  return name.startsWith(".");
}

function shouldIgnoreEntry(entry, options) {
  if (options.ignoredNames.has(entry.name)) return true;
  return !options.includeHidden && isHiddenName(entry.name);
}

async function scanFolder(folderPath, rawOptions = {}) {
  const options = createIndexOptions(rawOptions);
  const visitedDirectories = new Set();
  const files = [];

  async function walk(dir) {
    let entries;

    try {
      const realDir = await fsp.realpath(dir);
      if (visitedDirectories.has(realDir)) return;
      visitedDirectories.add(realDir);

      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (error) {
      console.warn(`Could not read directory: ${dir}`, error);
      return;
    }

    for (const entry of entries) {
      if (shouldIgnoreEntry(entry, options)) continue;

      const fullPath = path.join(dir, entry.name);
      const entryIsShortcut = entry.isSymbolicLink();
      const extension = path.extname(entry.name).toLowerCase();

      try {
        const stats = options.followShortcuts ? await fsp.stat(fullPath) : await fsp.lstat(fullPath);

        if (stats.isDirectory()) {
          await walk(fullPath);
        } else if (
          stats.isFile() &&
          (!entryIsShortcut || options.followShortcuts) &&
          (options.indexedExtensions.size === 0 || options.indexedExtensions.has(extension))
        ) {
          files.push({
            name: entry.name,
            path: fullPath,
            extension,
            size: stats.size,
            modifiedAt: stats.mtime.toISOString(),
          });
        }
      } catch (error) {
        console.warn(`Could not stat file: ${fullPath}`, error);
      }
    }
  }

  await walk(folderPath);
  return files;
}

function createSearchOptions(options = {}) {
  return {
    fuzzySearch: Boolean(options.fuzzySearch),
    maxResults: options.maxResults,
    searchPaths: Boolean(options.searchPaths),
  };
}

function createPreviewOptions(options = {}) {
  const previewMaxMb = Number(options.previewMaxMb) || defaultMaxPreviewMb;
  return {
    maxPreviewBytes: Math.min(Math.max(previewMaxMb, 1), 50) * 1024 * 1024,
  };
}

function assertIndexedPath(filePath) {
  if (typeof filePath !== "string" || !isIndexedPath(filePath)) {
    throw new Error("File path is not indexed");
  }
}

ipcMain.handle("index-folder", async (_, folderPath, options) => {
  const stats = await fsp.stat(folderPath);
  if (!stats.isDirectory()) throw new Error("Selected path is not a directory");

  const files = await scanFolder(folderPath, options);
  replaceFiles(files);

  return {
    total: files.length,
  };
});

ipcMain.handle("search-files", async (_, query, options) => {
  return searchFiles(query, createSearchOptions(options));
});

ipcMain.handle("get-image-preview", async (_, filePath, options) => {
  assertIndexedPath(filePath);

  const extension = path.extname(filePath).toLowerCase();
  const mimeType = imageMimeTypes.get(extension);
  const { maxPreviewBytes } = createPreviewOptions(options);

  if (!mimeType) {
    return null;
  }

  try {
    const stats = fs.statSync(filePath);

    if (!stats.isFile() || stats.size > maxPreviewBytes) {
      return null;
    }

    const buffer = fs.readFileSync(filePath);

    return {
      src: `data:${mimeType};base64,${buffer.toString("base64")}`,
      mimeType,
      size: stats.size,
    };
  } catch (error) {
    console.warn(`Could not create image preview: ${filePath}`, error);
    return null;
  }
});

ipcMain.handle("open-file", async (_, filePath) => {
  assertIndexedPath(filePath);
  return shell.openPath(filePath);
});

ipcMain.handle("show-in-folder", async (_, filePath) => {
  assertIndexedPath(filePath);
  shell.showItemInFolder(filePath);
});

ipcMain.handle("window-control", async (_, action) => {
  if (!mainWindow) return;

  if (action === "minimize") {
    mainWindow.minimize();
  }

  if (action === "maximize") {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }

  if (action === "close") {
    mainWindow.close();
  }
});
