const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fileIndexer", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  indexFolder: (folderPath, options) => ipcRenderer.invoke("index-folder", folderPath, options),
  searchFiles: (query, options) => ipcRenderer.invoke("search-files", query, options),
  getImagePreview: (filePath, options) => ipcRenderer.invoke("get-image-preview", filePath, options),
  openFile: (filePath) => ipcRenderer.invoke("open-file", filePath),
  showInFolder: (filePath) => ipcRenderer.invoke("show-in-folder", filePath),
  windowControl: (action) => ipcRenderer.invoke("window-control", action),
});
