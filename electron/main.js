import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { initDb, insertFiles, isIndexedPath, resetFiles, searchFiles } from "./database.js";

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
const videoMimeTypes = new Map([
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".ogg", "video/ogg"],
  [".ogv", "video/ogg"],
  [".mov", "video/quicktime"],
  [".m4v", "video/mp4"],
]);
const defaultMaxPreviewMb = 5;
const indexBatchSize = 500;

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

async function scanFolder(folderPath, rawOptions = {}, onBatch = () => {}) {
  const options = createIndexOptions(rawOptions);
  const visitedDirectories = new Set();
  let files = [];
  let total = 0;

  function flushBatch() {
    if (files.length === 0) return;
    total += files.length;
    onBatch(files, total);
    files = [];
  }

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

          if (files.length >= indexBatchSize) {
            flushBatch();
          }
        }
      } catch (error) {
        console.warn(`Could not stat file: ${fullPath}`, error);
      }
    }
  }

  await walk(folderPath);
  flushBatch();
  return total;
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

  resetFiles();
  const total = await scanFolder(folderPath, options, (files, indexedTotal) => {
    insertFiles(files);
    mainWindow?.webContents.send("index-progress", { total: indexedTotal });
  });

  return {
    total,
  };
});

ipcMain.handle("search-files", async (_, query, options) => {
  return searchFiles(query, createSearchOptions(options));
});

ipcMain.handle("get-media-preview", async (_, filePath, options) => {
  assertIndexedPath(filePath);

  const extension = path.extname(filePath).toLowerCase();
  const imageMimeType = imageMimeTypes.get(extension);
  const videoMimeType = videoMimeTypes.get(extension);
  const { maxPreviewBytes } = createPreviewOptions(options);

  if (!imageMimeType && !videoMimeType) {
    return null;
  }

  try {
    const stats = await fsp.stat(filePath);

    if (!stats.isFile()) {
      return null;
    }

    if (videoMimeType) {
      return {
        kind: "video",
        src: pathToFileURL(filePath).toString(),
        mimeType: videoMimeType,
        size: stats.size,
      };
    }

    if (stats.size > maxPreviewBytes) {
      return null;
    }

    const buffer = await fsp.readFile(filePath);

    return {
      kind: "image",
      src: `data:${imageMimeType};base64,${buffer.toString("base64")}`,
      mimeType: imageMimeType,
      size: stats.size,
    };
  } catch (error) {
    console.warn(`Could not create media preview: ${filePath}`, error);
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
