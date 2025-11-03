const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  analyzeCSV: (filePath, frameRate) => ipcRenderer.invoke('analyze-csv', filePath, frameRate),
  generateWAV: (csvPath, frameRate, timeColumn, selectedFields) => ipcRenderer.invoke('generate-wav', csvPath, frameRate, timeColumn, selectedFields)
});
