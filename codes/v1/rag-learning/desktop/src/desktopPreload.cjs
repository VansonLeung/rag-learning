const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('groveDesktop', {
  getPlatform: () => ipcRenderer.invoke('grove:platform'),
});

// Native menu shortcuts offer the explorer first refusal, then preserve text editing.
ipcRenderer.on('grove:edit-command', (_event, command) => {
  if (!['copy', 'cut', 'paste'].includes(command)) return;
  const unhandled = window.dispatchEvent(
    new CustomEvent('grove-explorer-command', { detail: command, cancelable: true }),
  );
  if (unhandled) ipcRenderer.send('grove:native-edit', command);
});
