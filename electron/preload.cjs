const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fileIndexer", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  indexFolder: (folderPath, options) => ipcRenderer.invoke("index-folder", folderPath, options),
  searchFiles: (query, options) => ipcRenderer.invoke("search-files", query, options),
  getMediaPreview: (filePath, options) => ipcRenderer.invoke("get-media-preview", filePath, options),
  onIndexProgress: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on("index-progress", listener);
    return () => ipcRenderer.removeListener("index-progress", listener);
  },
  openFile: (filePath) => ipcRenderer.invoke("open-file", filePath),
  showInFolder: (filePath) => ipcRenderer.invoke("show-in-folder", filePath),
  windowControl: (action) => ipcRenderer.invoke("window-control", action),
});
