const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const DATA_FILE = path.join(__dirname, 'data.json');

/* ---------------- 崩溃防御 ---------------- */

// 主进程全局异常兜底：避免单个异常直接闪退
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

// 渲染进程崩溃/卡死后自动恢复（透明窗口 + GPU 特效偶发崩溃）
function attachRendererCrashGuard(win) {
  win.webContents.on('render-process-gone', (event, details) => {
    console.error('[render-process-gone]', JSON.stringify(details));
    if (!win.isDestroyed()) {
      try { win.reload(); } catch (e) { /* 忽略 */ }
    }
  });
}

let configWin = null;
let tray = null;
const itemWins = new Map(); // itemId -> BrowserWindow
let resizeJob = null;       // 正在拖拽缩放的卡片
let fgMonitor = null;       // 前台窗口监控子进程
let fgFullscreen = false;   // 前台应用是否全屏
let trayHidden = false;     // 托盘手动隐藏
const autoHiddenIds = new Set(); // 完成目标后自动隐藏的卡片（当天）
let autoHideTimer = null;   // 每日自动恢复定时器

/* ---------------- 卡片尺寸规格 ---------------- */

const CARD_SIZES = {
  small: { w: 200, h: 110 },
  medium: { w: 300, h: 170 },
  large: { w: 420, h: 240 }
};
const CARD_RADIUS = 24;   // setShape 圆角半径：略大于 CSS 的 20px，让 clip-path 的平滑边缘完全落在窗口形状内
const MIN_W = 160, MIN_H = 90;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function cardSizeOf(item) {
  const card = item.card || {};
  const preset = CARD_SIZES[card.size];
  if (preset) return { w: preset.w, h: preset.h };
  // custom 或未知：取实际宽高
  return {
    w: clamp(parseInt(card.w, 10) || CARD_SIZES.medium.w, MIN_W, 700),
    h: clamp(parseInt(card.h, 10) || CARD_SIZES.medium.h, MIN_H, 450)
  };
}

/* ---------------- 数据读写 ---------------- */

function defaultData() {
  return {
    widget: { clickThrough: true },
    items: [],
    records: {}
  };
}

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data.widget) data.widget = defaultData().widget;
    if (!Array.isArray(data.items)) data.items = [];
    if (!data.records || typeof data.records !== 'object') data.records = {};
    return data;
  } catch (e) {
    return defaultData();
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('保存数据失败', e);
  }
}

/* ---------------- 日期 / 周期工具 ---------------- */

function pad(n) { return String(n).padStart(2, '0'); }

function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayKey() { return dateKey(new Date()); }

function periodStartKey(period) {
  const d = new Date();
  if (period === 'week') {
    const day = (d.getDay() + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day);
    return dateKey(monday);
  }
  if (period === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  return todayKey();
}

/* ---------------- 打卡逻辑 ---------------- */

// delta: 1 加打卡 / -1 减打卡（不限次数项用右键减）
function handleCheckin(id, delta = 1) {
  const data = loadData();
  const item = data.items.find((i) => i.id === id);
  if (!item) return data;

  const t = todayKey();
  const rec = data.records[id] || (data.records[id] = {});

  if (item.type === 'daily') {
    // 每天只能一次：再点一次取消
    if (delta >= 0) {
      if (rec[t]) delete rec[t];
      else rec[t] = true;
    }
  } else if (item.type === 'counter') {
    // 不限次数：自由加减，只记当天次数
    rec[t] = Math.max(0, (rec[t] || 0) + delta);
  } else {
    // 目标项：可多次，最多到目标
    const start = periodStartKey(item.period);
    let sum = 0;
    for (const [date, count] of Object.entries(rec)) {
      if (date >= start) sum += count;
    }
    if (delta >= 0) {
      if (sum < item.target) rec[t] = (rec[t] || 0) + 1;
    } else {
      rec[t] = Math.max(0, (rec[t] || 0) - 1);
    }
  }

  saveData(data);
  broadcast(data);
  return data;
}

/* ---------------- 广播 ---------------- */

function broadcast(data) {
  const payload = data || loadData();
  for (const win of itemWins.values()) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('data:changed', payload);
    }
  }
  if (configWin && !configWin.isDestroyed()) {
    configWin.webContents.send('data:changed', payload);
  }
}

/* ---------------- 卡片窗口（每个打卡项一个独立窗口） ---------------- */

// 把窗口裁剪成圆角矩形（透明窗口的 backdrop-filter 模糊是矩形的，
// 用 setShape 裁掉圆角外的部分，避免出现“凸起的直角”）
// 1px 步进 + 圆方程：行间无重叠、y 无重复，形状稳定可靠
function roundedShape(w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const rects = [];
  const step = 1;
  const addRow = (y, inset, height) => {
    if (height <= 0 || w - inset * 2 <= 0) return;
    const rx = Math.round(inset);
    const ry = Math.round(y);
    const rw = Math.round(w - inset * 2);
    const rh = Math.round(height);
    // round 后可能变成 0（如 0.3→0），0 尺寸矩形会导致 setShape 异常 → 丢弃
    if (rh <= 0 || rw <= 0) return;
    rects.push({ x: rx, y: ry, width: rw, height: rh });
  };
  // 顶部圆角条带（1px 逐行，圆方程求 inset）
  for (let y = 0; y < r; y += step) {
    const dist = r - y;
    const inset = r - Math.sqrt(Math.max(0, r * r - dist * dist));
    addRow(y, inset, Math.min(step, r - y));
  }
  // 中部
  addRow(r, 0, Math.max(0, h - r * 2));
  // 底部圆角条带
  for (let y = h - r; y < h; y += step) {
    const dist = y - (h - r);
    const inset = r - Math.sqrt(Math.max(0, r * r - dist * dist));
    addRow(y, inset, Math.min(step, h - y));
  }
  return rects;
}

function applyShape(win) {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  win.setShape(roundedShape(b.width, b.height, CARD_RADIUS));
}

// 新卡片默认位置：屏幕右下角向上堆叠
function nextCardPos(data, size) {
  const wa = screen.getPrimaryDisplay().workArea;
  const stack = Math.max(1, Math.floor((wa.height - 60) / (size.h + 16)));
  const idx = data.items.length % stack;
  const col = Math.floor(data.items.length / stack);
  return {
    x: Math.round(wa.x + wa.width - size.w - 24 - col * (size.w + 24)),
    y: Math.round(wa.y + wa.height - size.h - 24 - idx * (size.h + 16))
  };
}

function createCardWindow(item) {
  const size = cardSizeOf(item);
  const card = item.card || {};
  const wa = screen.getPrimaryDisplay().workArea;
  const x = (card.x != null) ? card.x : (wa.x + wa.width - size.w - 24);
  const y = (card.y != null) ? card.y : (wa.y + wa.height - size.h - 24);

  const win = new BrowserWindow({
    width: size.w,
    height: size.h,
    x, y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'widget', 'index.html'), { query: { id: item.id } });

  attachRendererCrashGuard(win);

  const apply = () => applyShape(win);
  win.once('ready-to-show', apply);
  win.webContents.once('did-finish-load', apply);
  win.on('resized', apply);

  // 用户拖动窗口 → 保存位置（防抖）
  const posTimers = new Map();
  win.on('moved', () => {
    clearTimeout(posTimers.get(item.id));
    posTimers.set(item.id, setTimeout(() => {
      const w = itemWins.get(item.id);
      if (!w || w.isDestroyed()) return;
      const b = w.getBounds();
      const data = loadData();
      const it = data.items.find((i) => i.id === item.id);
      if (!it) return;
      it.card = it.card || {};
      it.card.x = b.x;
      it.card.y = b.y;
      saveData(data);
      broadcast(data);
    }, 250));
  });

  win.on('closed', () => { itemWins.delete(item.id); });
  itemWins.set(item.id, win);
  return win;
}

// 让卡片窗口与数据保持同步：新增→创建，删除→销毁，移动/缩放→更新 bounds
function syncWidgetWindows(data) {
  const ids = new Set(data.items.map((i) => i.id));
  for (const [id, win] of itemWins) {
    if (!ids.has(id) && !win.isDestroyed()) {
      win.destroy();
      itemWins.delete(id);
    }
  }
  for (const item of data.items) {
    let win = itemWins.get(item.id);
    if (!win || win.isDestroyed()) {
      createCardWindow(item);
      continue;
    }
    const size = cardSizeOf(item);
    const card = item.card || {};
    const b = win.getBounds();
    const nx = (card.x != null) ? card.x : b.x;
    const ny = (card.y != null) ? card.y : b.y;
    if (b.x !== nx || b.y !== ny || b.width !== size.w || b.height !== size.h) {
      win.setBounds({ x: nx, y: ny, width: size.w, height: size.h });
      applyShape(win);
    }
  }
}

/* ---------------- 配置窗口 ---------------- */

function createConfigWindow() {
  if (configWin && !configWin.isDestroyed()) {
    configWin.show();
    configWin.focus();
    return;
  }
  configWin = new BrowserWindow({
    width: 720,
    height: 780,
    minWidth: 640,
    minHeight: 640,
    title: '打卡配置',
    backgroundColor: '#f2f4f8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  configWin.loadFile(path.join(__dirname, 'config', 'index.html'));
  attachRendererCrashGuard(configWin);
  configWin.on('closed', () => { configWin = null; });
}

/* ---------------- 托盘 ---------------- */

function createTrayIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rx = Math.min(x, size - 1 - x);
      const ry = Math.min(y, size - 1 - y);
      const inside = !(rx < 2 && ry < 2 && Math.hypot(2 - rx, 2 - ry) > 2);
      const i = (y * size + x) * 4;
      if (inside) {
        buf[i + 0] = 0xf5; // B
        buf[i + 1] = 0x9c; // G
        buf[i + 2] = 0x7c; // R
        buf[i + 3] = 0xff; // A
      } else {
        buf[i + 3] = 0x00;
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

/* ---------------- 可见性管理 ---------------- */

// 根据全屏状态、托盘手动隐藏、目标完成自动隐藏，统一控制卡片显示
function applyVisibility() {
  for (const [id, win] of itemWins) {
    if (win.isDestroyed()) continue;
    const autoHide = autoHiddenIds.has(id);
    const show = !fgFullscreen && !trayHidden && !autoHide;
    if (show && !win.isVisible()) win.show();
    else if (!show && win.isVisible()) win.hide();
  }
}

function toggleTrayVisibility() {
  trayHidden = !trayHidden;
  applyVisibility();
}

/* ---------------- 目标完成自动隐藏 ---------------- */

// 判断某打卡项今天是否应自动隐藏：
// - 目标次数：完成目标即隐藏（内置行为，无选项）
// - 每天一次：开启 autoHide 且今日已打卡
// - 不限次数：开启 autoHide 且今日次数 >= autoHideCount（默认 1）
function shouldAutoHideToday(item, data) {
  const rec = (data.records && data.records[item.id]) || {};
  if (item.type === 'goal') {
    const start = periodStartKey(item.period);
    let sum = 0;
    for (const [date, count] of Object.entries(rec)) {
      if (date >= start) sum += count;
    }
    return sum >= item.target;
  }
  if (!item.autoHide) return false;
  if (item.type === 'daily') return !!rec[todayKey()];
  if (item.type === 'counter') {
    return (rec[todayKey()] || 0) >= (item.autoHideCount || 1);
  }
  return false;
}

// 渲染端动画播完后调用：标记该卡片今天已自动隐藏
ipcMain.handle('card:autoHidden', (e, id) => {
  autoHiddenIds.add(id);
  applyVisibility();
});

// 数据变化后重新评估自动隐藏状态（完成→隐藏，取消完成/跨天→恢复）
function evaluateAutoHide(data) {
  const d = data || loadData();
  const completed = new Set();
  for (const item of d.items) {
    if (shouldAutoHideToday(item, d)) {
      completed.add(item.id);
    }
  }
  // 新增隐藏
  for (const id of completed) {
    if (!autoHiddenIds.has(id)) autoHiddenIds.add(id);
  }
  // 移除不再满足的（例如跨天、取消 autoHide、进度回退）
  for (const id of [...autoHiddenIds]) {
    if (!completed.has(id)) autoHiddenIds.delete(id);
  }
  applyVisibility();
}

// 每分钟检查一次：跨天后自动恢复显示
function startAutoHideScheduler() {
  autoHideTimer = setInterval(() => evaluateAutoHide(), 60000);
}

// 每日首次启动时也评估一次（例如昨晚完成的目标，今天应恢复）
function initAutoHide() {
  evaluateAutoHide();
  startAutoHideScheduler();
}

/* ---------------- 前台窗口监控（全屏时自动隐藏） ---------------- */

// 这些窗口即使覆盖整个屏幕也不算“全屏应用”：
// 桌面图标宿主、壁纸宿主（含 Wallpaper Engine）、任务栏、开始菜单、Rainmeter 皮肤、Dock 等常驻工具
const FG_SKIP_CLASSES = new Set([
  'Progman',                       // 桌面图标
  'WorkerW',                       // 壁纸宿主（Wallpaper Engine 也用它）
  'Shell_TrayWnd',                 // 任务栏
  'Shell_SecondaryTrayWnd',        // 副屏任务栏
  'DV2ControlHost',                // 开始菜单 / 搜索
  'Windows.UI.Core.CoreWindow',    // UWP 系统 UI
  'MultitaskingViewFrame',         // 任务视图 / Alt-Tab
  'XamlExplorerHostIslandWindow',  // 资源管理器 XAML 宿主
  'RainmeterMeterWindow',          // Rainmeter 皮肤窗口
  'RainmeterSkinWindow',           // Rainmeter 皮肤窗口
  'MyDockFinderDockWindow'         // My Dock Finder
]);
const FG_SKIP_PROCESSES = new Set([
  'rainmeter',         // Rainmeter
  'mydockfinder',      // My Dock Finder
  'mydock',            // My Dock Finder
  'dock_64',           // My Dock Finder
  'dockmod',           // My Dock Finder
  'dockmod64',         // My Dock Finder
  'wallpaper32',       // Wallpaper Engine
  'wallpaper64',       // Wallpaper Engine
  'wallpaperservice64',// Wallpaper Engine 服务
  'explorer'           // 资源管理器（桌面/任务栏由它承载）
]);

function startForegroundMonitor() {
  try {
    fgMonitor = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname, 'foreground-monitor.ps1')
    ], { windowsHide: true });

    let buf = '';
    fgMonitor.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        handleForegroundLine(line);
      }
    });
    fgMonitor.on('error', (err) => {
      console.error('前台监控启动失败', err.message);
      fgMonitor = null;
    });
    fgMonitor.on('exit', () => { fgMonitor = null; });
  } catch (e) {
    console.error('前台监控失败（不影响使用）', e);
  }
}

function handleForegroundLine(line) {
  const [rectPart, clsPart, titlePart, procPart] = line.split('|');
  const parts = (rectPart || '').split(',').map((s) => parseInt(s, 10));
  if (parts.length !== 4 || parts.some(isNaN)) return;
  const [l, t, r, b] = parts;
  const wa = screen.getPrimaryDisplay().workArea;
  const coversFull = l <= wa.x && t <= wa.y && r >= wa.x + wa.width && b >= wa.y + wa.height;
  let fullscreen = coversFull;
  if (coversFull) {
    // 覆盖全屏但属于桌面/壁纸/常驻工具 → 不视为全屏应用
    const cls = (clsPart || '').trim();
    const proc = (procPart || '').trim().toLowerCase();
    const isTool = FG_SKIP_CLASSES.has(cls) || FG_SKIP_PROCESSES.has(proc);
    fullscreen = !isTool;
  }
  if (fullscreen !== fgFullscreen) {
    fgFullscreen = fullscreen;
    applyVisibility();
  }
}

/* ---------------- 托盘 ---------------- */

function createTray() {
  try {
    tray = new Tray(createTrayIcon());
    tray.setToolTip('打卡组件');
    const menu = Menu.buildFromTemplate([
      { label: '打开配置', click: () => createConfigWindow() },
      { label: '显示/隐藏所有卡片', click: toggleTrayVisibility },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => createConfigWindow());
  } catch (e) {
    console.error('托盘创建失败（不影响使用）', e);
  }
}

/* ---------------- IPC ---------------- */

ipcMain.handle('data:get', () => loadData());

ipcMain.handle('data:save', (e, data) => {
  saveData(data);
  syncWidgetWindows(data);
  evaluateAutoHide(data);
  broadcast(data);
  return data;
});

ipcMain.handle('item:add', (e, payload) => {
  const data = loadData();
  const type = ['daily', 'counter', 'goal'].includes(payload.type) ? payload.type : 'daily';
  const sizeName = ['small', 'medium', 'large', 'custom'].includes(payload.cardSize) ? payload.cardSize : 'medium';
  const preset = CARD_SIZES[sizeName];
  const size = preset ? { w: preset.w, h: preset.h } : { w: CARD_SIZES.medium.w, h: CARD_SIZES.medium.h };
  const pos = nextCardPos(data, size);
  const item = {
    id: 'id_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    type,
    name: (payload.name || '').trim(),
    color: payload.color || '#7c9cf5',
    fontSize: ['small', 'medium', 'large'].includes(payload.fontSize) ? payload.fontSize : 'medium',
    theme: /^#[0-9a-fA-F]{6}$/.test(payload.theme || '') ? payload.theme : '#f5f7fc',
    autoHide: !!payload.autoHide,
    autoHideCount: Math.max(1, parseInt(payload.autoHideCount, 10) || 1),
    sort: data.items.length,
    card: { size: sizeName, w: size.w, h: size.h, x: pos.x, y: pos.y }
  };
  // 背景透明度（0.3 ~ 1，默认 0.88）
  const o = parseFloat(payload.opacity);
  if (!isNaN(o)) item.opacity = clamp(o, 0.3, 1);
  else item.opacity = 0.88;
  if (type === 'goal') {
    item.target = Math.max(1, parseInt(payload.target, 10) || 1);
    item.period = ['day', 'week', 'month'].includes(payload.period) ? payload.period : 'day';
  }
  if (item.name) data.items.push(item);
  saveData(data);
  syncWidgetWindows(data);
  evaluateAutoHide(data);
  broadcast(data);
  return data;
});

ipcMain.handle('item:update', (e, { id, changes }) => {
  const data = loadData();
  const item = data.items.find((i) => i.id === id);
  if (!item) return data;
  if (typeof changes.name === 'string' && changes.name.trim()) item.name = changes.name.trim();
  if (changes.color) item.color = changes.color;
  if (['daily', 'counter', 'goal'].includes(changes.type)) item.type = changes.type;
  if (typeof changes.autoHide === 'boolean') item.autoHide = changes.autoHide;
  if (changes.autoHideCount !== undefined) {
    item.autoHideCount = Math.max(1, parseInt(changes.autoHideCount, 10) || 1);
  }
  if (['small', 'medium', 'large'].includes(changes.fontSize)) item.fontSize = changes.fontSize;
  if (/^#[0-9a-fA-F]{6}$/.test(changes.theme || '')) item.theme = changes.theme;
  // 背景透明度（0.3 ~ 1）
  if (changes.opacity !== undefined && changes.opacity !== null) {
    const o = parseFloat(changes.opacity);
    if (!isNaN(o)) item.opacity = clamp(o, 0.3, 1);
  }
  if (item.type === 'goal') {
    if (changes.target) item.target = Math.max(1, parseInt(changes.target, 10) || 1);
    if (['day', 'week', 'month'].includes(changes.period)) item.period = changes.period;
  } else {
    delete item.target;
    delete item.period;
  }
  // 卡片大小规格
  if (['small', 'medium', 'large', 'custom'].includes(changes.cardSize)) {
    item.card = item.card || {};
    item.card.size = changes.cardSize;
    const preset = CARD_SIZES[changes.cardSize];
    if (preset) {
      item.card.w = preset.w;
      item.card.h = preset.h;
    }
  }
  saveData(data);
  syncWidgetWindows(data);
  evaluateAutoHide(data);
  broadcast(data);
  return data;
});

ipcMain.handle('item:delete', (e, id) => {
  const data = loadData();
  data.items = data.items.filter((i) => i.id !== id);
  delete data.records[id];
  saveData(data);
  syncWidgetWindows(data);
  evaluateAutoHide(data);
  broadcast(data);
  return data;
});

ipcMain.handle('checkin:toggle', (e, id) => handleCheckin(id, 1));
ipcMain.handle('checkin:minus', (e, id) => handleCheckin(id, -1));

// 配置界面拖放卡片 → 移动窗口
ipcMain.handle('card:move', (e, { id, x, y }) => {
  const data = loadData();
  const item = data.items.find((i) => i.id === id);
  if (!item) return data;
  item.card = item.card || {};
  item.card.x = Math.round(x);
  item.card.y = Math.round(y);
  const win = itemWins.get(id);
  if (win && !win.isDestroyed()) {
    const b = win.getBounds();
    win.setBounds({ x: item.card.x, y: item.card.y, width: b.width, height: b.height });
  }
  saveData(data);
  broadcast(data);
  return data;
});

// 设置预设大小规格
ipcMain.handle('card:setSize', (e, { id, size }) => {
  const data = loadData();
  const item = data.items.find((i) => i.id === id);
  if (!item) return data;
  if (!['small', 'medium', 'large', 'custom'].includes(size)) return data;
  item.card = item.card || {};
  item.card.size = size;
  const preset = CARD_SIZES[size];
  if (preset) {
    item.card.w = preset.w;
    item.card.h = preset.h;
  }
  saveData(data);
  syncWidgetWindows(data);
  broadcast(data);
  return data;
});

// 卡片右下角手柄拖拽缩放：主进程轮询鼠标位置，避免鼠标移出窗口丢失事件
ipcMain.handle('card:resizeStart', (e, { id, startX, startY, startW, startH }) => {
  const win = itemWins.get(id);
  if (!win || win.isDestroyed()) return;
  if (resizeJob) {
    clearInterval(resizeJob.timer);
    resizeJob = null;
  }
  resizeJob = { id, win, startX, startY, startW, startH };
  resizeJob.timer = setInterval(() => {
    const job = resizeJob;
    if (!job) return;
    // 窗口可能已被销毁（数据变化触发重建），此时安全退出缩放
    if (!job.win || job.win.isDestroyed()) {
      clearInterval(job.timer);
      resizeJob = null;
      return;
    }
    const p = screen.getCursorScreenPoint();
    const w = Math.round(clamp(job.startW + (p.x - job.startX), MIN_W, 700));
    const h = Math.round(clamp(job.startH + (p.y - job.startY), MIN_H, 450));
    job.win.setBounds({ width: w, height: h });
    applyShape(job.win);
  }, 16);
});

ipcMain.handle('card:resizeEnd', () => {
  const job = resizeJob;
  if (!job) return;
  clearInterval(job.timer);
  resizeJob = null;
  // 窗口可能已被销毁（例如拖拽期间打卡项被删除）
  if (!job.win || job.win.isDestroyed()) return;
  const b = job.win.getBounds();
  const data = loadData();
  const item = data.items.find((i) => i.id === job.id);
  if (item) {
    item.card = item.card || {};
    item.card.size = 'custom';
    item.card.w = b.width;
    item.card.h = b.height;
    saveData(data);
  }
  broadcast(data);
});

ipcMain.handle('screen:workarea', () => screen.getPrimaryDisplay().workArea);

ipcMain.handle('config:open', () => createConfigWindow());

/* ---------------- 生命周期 ---------------- */

app.whenReady().then(() => {
  syncWidgetWindows(loadData());
  createTray();
  startForegroundMonitor();
  initAutoHide();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) syncWidgetWindows(loadData());
  });
});

// 退出时清理前台监控子进程和定时器
app.on('will-quit', () => {
  if (fgMonitor) {
    try { fgMonitor.kill(); } catch (e) { /* 忽略 */ }
    fgMonitor = null;
  }
  if (autoHideTimer) {
    clearInterval(autoHideTimer);
    autoHideTimer = null;
  }
});

// 桌面组件应常驻：仅通过托盘“退出”结束
app.on('window-all-closed', () => {
  // 留空
});
