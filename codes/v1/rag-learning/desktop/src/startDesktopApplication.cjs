const {
  app,
  BrowserWindow,
  utilityProcess,
  session,
  dialog,
  shell,
  ipcMain,
  Menu,
} = require('electron');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
if (process.env.GROVE_USER_DATA_DIR) app.setPath('userData', process.env.GROVE_USER_DATA_DIR);
const ownsLock = app.requestSingleInstanceLock();
let mainWindow;
let backend;
let origin;
let quitting = false;
let backendExited = false;
if (!ownsLock) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app
    .whenReady()
    .then(startDesktopApplication)
    .catch((error) => {
      dialog.showErrorBox('Grove could not start', error.message);
      app.quit();
    });
}
async function startDesktopApplication() {
  const token = randomBytes(32).toString('hex');
  backend = utilityProcess.fork(path.join(__dirname, 'runDesktopBackend.mjs'), [], {
    serviceName: 'Grove library backend',
    env: {
      ...process.env,
      RAG_DATA_DIR: process.env.RAG_DATA_DIR || path.join(app.getPath('userData'), 'library'),
      GROVE_DESKTOP_TOKEN: token,
    },
    stdio: 'pipe',
  });
  backend.stdout?.on('data', (data) => console.log(data.toString().trimEnd()));
  backend.stderr?.on('data', (data) => console.error(data.toString().trimEnd()));
  backend.on('exit', () => {
    backendExited = true;
    if (!quitting) {
      dialog.showErrorBox(
        'Grove backend stopped',
        'Please restart Grove. Your saved library remains on this device.',
      );
      app.quit();
    }
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The library backend did not start within 60 seconds')),
      60000,
    );
    backend.on('message', (message) => {
      if (message.type === 'ready') {
        clearTimeout(timer);
        resolve(message.port);
      } else if (message.type === 'error') {
        clearTimeout(timer);
        reject(new Error(message.message));
      }
    });
    backend.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('The library backend exited during startup'));
    });
  });
  origin = `http://127.0.0.1:${port}`;
  const desktopSession = session.fromPartition('persist:grove');
  desktopSession.webRequest.onBeforeSendHeaders({ urls: [origin + '/*'] }, (details, callback) =>
    callback({ requestHeaders: { ...details.requestHeaders, 'x-grove-desktop-token': token } }),
  );
  desktopSession.webRequest.onHeadersReceived({ urls: [origin + '/*'] }, (details, callback) =>
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'",
        ],
      },
    }),
  );
  desktopSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  desktopSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Save original document' });
  });
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 860,
    minHeight: 600,
    title: 'Grove',
    backgroundColor: '#fbfcf9',
    show: false,
    webPreferences: {
      session: desktopSession,
      preload: path.join(__dirname, 'desktopPreload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const command = { c: 'copy', x: 'cut', v: 'paste' }[input.key?.toLowerCase()];
    if (input.type === 'keyDown' && (input.meta || input.control) && command) {
      event.preventDefault();
      mainWindow.webContents.send('grove:edit-command', command);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && new URL(url).origin !== origin) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  ipcMain.on('grove:native-edit', (event, command) => {
    if (
      event.senderFrame?.url?.startsWith(origin + '/') &&
      ['copy', 'cut', 'paste'].includes(command)
    )
      event.sender[command]();
  });
  ipcMain.handle('grove:platform', (event) => {
    if (event.senderFrame?.url?.startsWith(origin + '/')) return process.platform;
    throw new Error('Unknown desktop frame');
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  await mainWindow.loadURL(origin);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: 'File', submenu: [{ label: 'Close window', role: 'close' }] },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          ...['cut', 'copy', 'paste'].map((command) => ({
            label: command[0].toUpperCase() + command.slice(1),
            accelerator: { cut: 'CmdOrCtrl+X', copy: 'CmdOrCtrl+C', paste: 'CmdOrCtrl+V' }[command],
            click: () => mainWindow.webContents.send('grove:edit-command', command),
          })),
          { role: 'selectAll' },
        ],
      },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Show library data folder',
            click: () =>
              shell.openPath(
                process.env.RAG_DATA_DIR || path.join(app.getPath('userData'), 'library'),
              ),
          },
        ],
      },
    ]),
  );
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', (event) => {
  if (quitting || !backend || backendExited) return;
  event.preventDefault();
  quitting = true;
  const deadline = setTimeout(() => {
    backend.kill();
    app.quit();
  }, 10000);
  backend.once('exit', () => {
    clearTimeout(deadline);
    app.quit();
  });
  backend.postMessage({ type: 'shutdown' });
});
