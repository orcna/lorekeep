const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');

// 🛡️ MÜHÜR 1: Google'ın embedded tarayıcı tespitini aşmak için User-Agent
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Firebase Auth pop-up'ları için şart
      devTools: true,
      // 🛡️ MÜHÜR 2: Pop-up'ların yeni pencerede açılmasını sağlar
      nativeWindowOpen: true 
    }
  });

  // 🛡️ MÜHÜR 3: Global Session üzerinden User-Agent mühürleme
  // Google bu UA'yı görünce karşısında gerçek Chrome var sanacak.
  session.defaultSession.setUserAgent(CHROME_UA);

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  /**
   * 🛡️ POP-UP HANDLER (Geri Dönüş)
   * shell.openExternal'ı kaldırdık, action: 'allow' diyerek pop-up'ı içeri aldık.
   */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Sadece Google Auth pencerelerine izin ver, diğerlerini dışarı fırlat
    if (url.includes('accounts.google.com') || url.includes('firebaseapp.com')) {
      return { 
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 600,
          autoHideMenuBar: true,
          title: 'Google Nexus Login'
        }
      };
    }
    
    // Auth dışındaki linkler hala güvenli bölge (tarayıcı)
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // IPC ve Instance yönetimi aynı kalıyor...
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

  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', (event, commandLine) => {
      const url = commandLine.pop();
      if (url && url.includes('lorekeep://')) {
        mainWindow.webContents.send('auth-success', url);
      }
    });
  }
}

app.whenReady().then(createWindow);

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) mainWindow.webContents.send('auth-success', url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});