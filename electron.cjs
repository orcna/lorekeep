const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');

// lorekeep:// linklerini bu uygulamaya zimbala
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('lorekeep', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('lorekeep');
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450, 
    height: 700,
    frame: false, 
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // ⚡ KRİTİK: file:// protokolünün dış API'lere ve yerel dosyalara erişmesini sağlar
      webSecurity: false, 
      // Google Login'in paketli uygulamada çalışması için User Agent taklidi
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const isDev = !app.isPackaged; 
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // ⚡ Dosya yolu mühürü: dist/index.html'i yükler
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // App.tsx'den gelen talepleri işler
  ipcMain.on('resize-window', (event, { resolution, isFullscreen }) => {
    if (mainWindow) {
      if (isFullscreen) {
        mainWindow.setFullScreen(true);
      } else {
        mainWindow.setFullScreen(false);
        const [width, height] = resolution.split('x').map(Number);
        if (width && height) {
          mainWindow.setSize(width, height, true);
          mainWindow.center(); 
        }
      }
    }
  });

  // Tarayıcıdan link geldiğinde mevcut pencereye odaklan
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', (event, commandLine) => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        
        const url = commandLine.pop();
        if (url && url.includes('lorekeep://')) {
          mainWindow.webContents.send('auth-success', url); 
        }
      }
    });
  }
}

app.whenReady().then(createWindow);

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('auth-success', url);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});