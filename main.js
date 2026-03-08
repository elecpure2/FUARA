const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer } = require('./server');
const db = require('./db');

process.stdout.on('error', () => { });
process.stderr.on('error', () => { });

let mainWindow = null;
let stickerWindow = null;
let youtubeAlarmWindow = null;
let tray = null;
let apiServer = null;

// ── Window state persistence ──

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (_) { }
  return {};
}

function saveWindowState() {
  const state = {};

  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    state.main = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }

  if (stickerWindow && !stickerWindow.isDestroyed()) {
    const bounds = stickerWindow.getBounds();
    state.sticker = {
      x: bounds.x, y: bounds.y,
      pinned: stickerWindow.isAlwaysOnTop(),
    };
  }

  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (_) { }
}

// ── Window creation ──

function createMainWindow() {
  const saved = loadWindowState().main;

  mainWindow = new BrowserWindow({
    width: saved?.width || 960,
    height: saved?.height || 820,
    x: saved?.x,
    y: saved?.y,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: '#111113',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'windows', 'main', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (e) => {
    e.preventDefault();
    saveWindowState();
    mainWindow.hide();
  });

  let mainSaveTimer = null;
  const debounceSaveMain = () => {
    if (mainSaveTimer) clearTimeout(mainSaveTimer);
    mainSaveTimer = setTimeout(saveWindowState, 500);
  };
  mainWindow.on('resize', debounceSaveMain);
  mainWindow.on('move', debounceSaveMain);
}

function createStickerWindow() {
  const saved = loadWindowState().sticker;
  const pinned = saved?.pinned ?? true;

  stickerWindow = new BrowserWindow({
    width: 280,
    height: 540,
    x: saved?.x ?? 40,
    y: saved?.y ?? 40,
    frame: false,
    transparent: true,
    alwaysOnTop: pinned,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  stickerWindow.loadFile(path.join(__dirname, 'windows', 'sticker', 'index.html'));
  stickerWindow.once('ready-to-show', () => {
    stickerWindow.show();
    stickerWindow.webContents.send('pin-state', pinned);
  });

  stickerWindow.on('close', (e) => {
    e.preventDefault();
    saveWindowState();
    stickerWindow.hide();
  });

  let stickerSaveTimer = null;
  stickerWindow.on('move', () => {
    if (stickerSaveTimer) clearTimeout(stickerSaveTimer);
    stickerSaveTimer = setTimeout(saveWindowState, 500);
  });
}

// ── Tray ──

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('FUARA');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'FUARA 열기', click: () => mainWindow && mainWindow.show() },
    { label: '스티커 표시/숨기기', click: () => toggleSticker() },
    { type: 'separator' },
    { label: '종료', click: () => quitApp() },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow && mainWindow.show());
}

function toggleSticker() {
  if (!stickerWindow) return;
  if (stickerWindow.isVisible()) {
    stickerWindow.hide();
  } else {
    stickerWindow.show();
  }
}

function quitApp() {
  saveWindowState();
  if (mainWindow) { mainWindow.removeAllListeners('close'); mainWindow.close(); }
  if (stickerWindow) { stickerWindow.removeAllListeners('close'); stickerWindow.close(); }
  if (apiServer) apiServer.close();
  db.close();
  app.quit();
}

// ── Notify sticker of changes ──

function notifyStickerRefresh() {
  if (stickerWindow && !stickerWindow.isDestroyed()) {
    stickerWindow.webContents.send('tasks-changed');
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tasks-changed');
    mainWindow.webContents.send('notes-changed');
  }
}

// ── IPC Handlers ──

function registerIPC() {
  ipcMain.handle('get-projects', () => db.getAllProjects());

  ipcMain.handle('select-alarm-sound', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '알람 사운드 선택',
      filters: [{ name: '오디오 파일', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('play-youtube-alarm', (_e, url) => {
    if (youtubeAlarmWindow && !youtubeAlarmWindow.isDestroyed()) {
      youtubeAlarmWindow.close();
    }
    // Extract video ID from various YouTube URL formats
    let videoId = null;
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtu.be')) videoId = u.pathname.slice(1);
      else videoId = u.searchParams.get('v');
    } catch (_) { }
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return false;

    youtubeAlarmWindow = new BrowserWindow({
      width: 1, height: 1,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    youtubeAlarmWindow.loadURL(`https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1`);
    youtubeAlarmWindow.on('closed', () => { youtubeAlarmWindow = null; });
    return true;
  });

  ipcMain.handle('stop-youtube-alarm', () => {
    if (youtubeAlarmWindow && !youtubeAlarmWindow.isDestroyed()) {
      youtubeAlarmWindow.close();
      youtubeAlarmWindow = null;
    }
    return true;
  });

  ipcMain.handle('create-project', (_e, data) => db.createProject(data));
  ipcMain.handle('delete-project', (_e, id) => db.deleteProject(id));

  ipcMain.handle('get-notes', (_e, projectId) => db.getAllNotes(projectId));
  ipcMain.handle('create-note', (_e, data) => {
    const note = db.createNote(data);
    notifyStickerRefresh();
    return note;
  });
  ipcMain.handle('update-note', (_e, id, fields) => {
    const note = db.updateNote(id, fields);
    notifyStickerRefresh();
    return note;
  });
  ipcMain.handle('delete-note', (_e, id) => {
    db.deleteNote(id);
    notifyStickerRefresh();
    return { ok: true };
  });

  ipcMain.handle('get-tasks-today', (_e, projectId) => db.getTodayTasks(projectId));
  ipcMain.handle('get-tasks-by-date', (_e, date, projectId) => db.getTasksByDate(date, projectId));
  ipcMain.handle('get-tasks-by-project', (_e, projectId) => db.getTasksByProject(projectId));
  ipcMain.handle('get-subtasks', (_e, parentId) => db.getSubtasks(parentId));
  ipcMain.handle('get-completed-by-month', (_e, year, month, projectId) => db.getCompletedTasksByMonth(year, month, projectId));
  ipcMain.handle('create-task', (_e, data) => {
    const task = db.createTask(data);
    notifyStickerRefresh();
    return task;
  });
  ipcMain.handle('update-task', (_e, id, fields) => {
    const task = db.updateTask(id, fields);
    notifyStickerRefresh();
    return task;
  });
  ipcMain.handle('delete-task', (_e, id) => {
    db.deleteTask(id);
    notifyStickerRefresh();
    return { ok: true };
  });

  ipcMain.handle('get-schedules', (_e, date, projectId) => db.getSchedulesByDate(date, projectId));
  ipcMain.handle('get-recent-schedule-templates', (_e, days, minUsage) => db.getRecentScheduleTemplates(days, minUsage));
  ipcMain.handle('create-schedule', (_e, data) => {
    const schedule = db.createSchedule(data);
    notifyStickerRefresh();
    return schedule;
  });
  ipcMain.handle('update-schedule', (_e, id, fields) => {
    const schedule = db.updateSchedule(id, fields);
    notifyStickerRefresh();
    return schedule;
  });
  ipcMain.handle('delete-schedule', (_e, id) => {
    db.deleteSchedule(id);
    notifyStickerRefresh();
    return { ok: true };
  });

  // Sections
  ipcMain.handle('get-sections', (_e, projectId) => db.getSectionsByProject(projectId));
  ipcMain.handle('create-section', (_e, data) => {
    const section = db.createSection(data);
    notifyStickerRefresh();
    return section;
  });
  ipcMain.handle('update-section', (_e, id, fields) => {
    const section = db.updateSection(id, fields);
    notifyStickerRefresh();
    return section;
  });
  ipcMain.handle('delete-section', (_e, id) => {
    db.deleteSection(id);
    notifyStickerRefresh();
    return { ok: true };
  });

  // Section Items
  ipcMain.handle('get-items', (_e, sectionId) => db.getItemsBySection(sectionId));
  ipcMain.handle('get-all-items-by-project', (_e, projectId) => db.getAllItemsByProject(projectId));
  ipcMain.handle('get-project-hub', (_e, projectId) => db.getProjectHubData(projectId));
  ipcMain.handle('get-project-worklog', (_e, projectId, date) => db.getProjectWorklog(projectId, date));
  ipcMain.handle('capture-hub-item', (_e, projectId, data) => {
    const result = db.captureHubItem(projectId, data);
    notifyStickerRefresh();
    return result;
  });
  ipcMain.handle('upsert-worklog', (_e, projectId, data) => {
    const result = db.upsertWorklogEntry(projectId, data);
    notifyStickerRefresh();
    return result;
  });
  ipcMain.handle('create-item', (_e, data) => {
    const item = db.createItem(data);
    notifyStickerRefresh();
    return item;
  });
  ipcMain.handle('update-item', (_e, id, fields) => {
    const item = db.updateItem(id, fields);
    notifyStickerRefresh();
    return item;
  });
  ipcMain.handle('delete-item', (_e, id) => {
    db.deleteItem(id);
    notifyStickerRefresh();
    return { ok: true };
  });

  ipcMain.handle('get-monthly-subscriptions', () => db.getMonthlySubscriptions());
  ipcMain.handle('create-monthly-subscription', (_e, data) => {
    const subscription = db.createMonthlySubscription(data);
    notifyStickerRefresh();
    return subscription;
  });
  ipcMain.handle('update-monthly-subscription', (_e, id, fields) => {
    const subscription = db.updateMonthlySubscription(id, fields);
    notifyStickerRefresh();
    return subscription;
  });
  ipcMain.handle('delete-monthly-subscription', (_e, id) => {
    db.deleteMonthlySubscription(id);
    notifyStickerRefresh();
    return { ok: true };
  });

  ipcMain.on('show-main', () => mainWindow && mainWindow.show());
  ipcMain.on('toggle-sticker', () => toggleSticker());

  // Image save
  const IMAGES_DIR = path.join(__dirname, 'images');
  ipcMain.handle('save-image', async (_e, { base64, ext }) => {
    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || 'png'}`;
    const filePath = path.join(IMAGES_DIR, name);
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return filePath;
  });

  // Effort
  ipcMain.handle('get-effort-stats', () => db.getEffortStats());
  ipcMain.handle('get-effort-calendar', (_e, year, month) => {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return db.getEffortRange(start, end);
  });

  ipcMain.handle('get-schedules-by-month', (_e, year, month) => db.getSchedulesByMonth(year, month));

  // Work Sessions
  ipcMain.handle('work-get-active', () => db.getActiveWorkSession());
  ipcMain.handle('work-start', () => db.startWorkSession());
  ipcMain.handle('work-stop', (_e, id) => db.stopWorkSession(id));
  ipcMain.handle('work-sessions-by-date', (_e, date) => db.getWorkSessionsByDate(date));
  ipcMain.handle('work-total-by-date', (_e, date) => db.getWorkTotalByDate(date));
  ipcMain.handle('work-total-by-month', (_e, year, month) => db.getWorkTotalByMonth(year, month));

  ipcMain.handle('toggle-sticker-pin', () => {
    if (!stickerWindow) return false;
    const current = stickerWindow.isAlwaysOnTop();
    stickerWindow.setAlwaysOnTop(!current);
    saveWindowState();
    return !current;
  });
}

// ── Korean Menu ──

function createAppMenu() {
  const template = [
    {
      label: '파일',
      submenu: [
        { label: '새 작업', accelerator: 'CmdOrCtrl+N', click: () => mainWindow && mainWindow.webContents.send('focus-new-task') },
        { type: 'separator' },
        { label: '스티커 표시/숨기기', accelerator: 'CmdOrCtrl+Shift+S', click: () => toggleSticker() },
        { type: 'separator' },
        { label: '종료', accelerator: 'CmdOrCtrl+Q', click: () => quitApp() },
      ],
    },
    {
      label: '편집',
      submenu: [
        { label: '실행 취소', role: 'undo', accelerator: 'CmdOrCtrl+Z' },
        { label: '다시 실행', role: 'redo', accelerator: 'CmdOrCtrl+Shift+Z' },
        { type: 'separator' },
        { label: '잘라내기', role: 'cut', accelerator: 'CmdOrCtrl+X' },
        { label: '복사', role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { label: '붙여넣기', role: 'paste', accelerator: 'CmdOrCtrl+V' },
        { label: '전체 선택', role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { label: '새로고침', role: 'reload', accelerator: 'CmdOrCtrl+R' },
        { label: '강제 새로고침', role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+R' },
        { type: 'separator' },
        { label: '확대', role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { label: '축소', role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
        { label: '원래 크기', role: 'resetZoom', accelerator: 'CmdOrCtrl+0' },
        { type: 'separator' },
        { label: '전체 화면', role: 'togglefullscreen', accelerator: 'F11' },
        { type: 'separator' },
        { label: '개발자 도구', role: 'toggleDevTools', accelerator: 'F12' },
      ],
    },
    {
      label: '창',
      submenu: [
        { label: '최소화', role: 'minimize' },
        { label: '닫기', role: 'close' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── App lifecycle ──

app.whenReady().then(async () => {
  registerIPC();
  createAppMenu();

  apiServer = await startServer(notifyStickerRefresh);

  createMainWindow();
  createStickerWindow();
  createTray();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
