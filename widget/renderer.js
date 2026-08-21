/* ---------- 当前卡片对应的打卡项 id ---------- */
const ITEM_ID = new URLSearchParams(location.search).get('id');
let state = null;

/* ---------- 日期 / 周期工具 ---------- */
function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
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

function goalProgress(item, rec) {
  const start = periodStartKey(item.period);
  let sum = 0;
  for (const [date, count] of Object.entries(rec)) {
    if (date >= start) sum += count;
  }
  return sum;
}

/* ---------- 主题工具 ---------- */
function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function isDarkTheme(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 120;
}

/* ---------- 渲染 ---------- */

// 完成自动隐藏：防止重复触发动画
let hideAnimStarted = false;
let hideNotified = false;  // 是否已通知主进程隐藏（避免隐藏后重复播放动画）

function render() {
  const item = (state && state.items || []).find((i) => i.id === ITEM_ID);
  const card = document.getElementById('card');
  if (!item) {
    card.style.opacity = 0.35;
    document.getElementById('big').textContent = '（已删除）';
    return;
  }
  card.style.opacity = 1;

  // 主题：背景色（透明度可调）+ 强调色 + 字体档
  const theme = item.theme || '#f5f7fc';
  const accent = item.color || '#7c9cf5';
  const opacity = (item.opacity != null) ? item.opacity : 0.88;
  card.style.setProperty('--theme', hexToRgba(theme, opacity));
  card.style.setProperty('--accent', accent);
  document.body.classList.toggle('dark', isDarkTheme(theme));
  document.body.dataset.font = item.fontSize || 'medium';

  // 锁定状态：禁拖拽、隐藏缩放手柄、锁头常显
  const locked = !!item.locked;
  card.classList.toggle('locked', locked);
  const lockEl = document.getElementById('lock');
  lockEl.classList.toggle('locked', locked);
  lockEl.title = locked ? '已锁定（需在配置界面解锁）' : '锁定位置';
  // 锁头图标：锁定实心 / 解锁空心
  const shackle = lockEl.querySelector('.lock-shackle');
  if (shackle) {
    shackle.setAttribute('d', locked
      ? 'M8 11V7a4 4 0 0 1 8 0v4'
      : 'M8 11V7a4 4 0 0 1 7.6-3.9');
  }

  const rec = (state.records && state.records[item.id]) || {};
  const big = document.getElementById('big');
  const progressArea = document.getElementById('progressArea');
  const fill = document.getElementById('fill');
  const countEl = document.getElementById('count');

  if (item.type === 'daily') {
    const done = !!rec[todayKey()];
    progressArea.classList.add('hidden');
    big.classList.toggle('done', done);
    big.textContent = item.name;
    maybeAutoHide(item, done);
  } else if (item.type === 'counter') {
    // 不限次数：大字显示名称，下方显示今日次数
    const n = rec[todayKey()] || 0;
    progressArea.classList.remove('hidden');
    document.querySelector('.progress-area .track').style.display = 'none';
    big.classList.toggle('done', n > 0);
    big.textContent = item.name;
    countEl.textContent = `今日 ${n} 次`;
    maybeAutoHide(item, n >= (item.autoHideCount || 1));
  } else {
    // 目标项
    const progress = goalProgress(item, rec);
    const pct = item.target > 0 ? Math.min(100, Math.round((progress / item.target) * 100)) : 0;
    const complete = progress >= item.target;
    progressArea.classList.remove('hidden');
    document.querySelector('.progress-area .track').style.display = '';
    big.classList.toggle('done', complete);
    big.textContent = item.name;
    fill.style.width = pct + '%';
    countEl.textContent = `${progress} / ${item.target}`;
    // 目标次数：完成目标即自动隐藏（内置行为，无选项）
    maybeAutoHide(item, complete);
  }
}

// 触发条件满足 → 播放消失动画，播完通知主进程隐藏
// - 目标次数：完成目标即隐藏（内置）
// - 每天一次 / 不限次数：需开启 autoHide 且满足触发条件
function maybeAutoHide(item, reached) {
  const card = document.getElementById('card');
  const enabled = item.type === 'goal' || item.autoHide;
  if (!enabled || !reached) {
    // 条件不再满足（如右键减打卡、跨天重置）→ 取消动画并完整恢复卡片
    if (hideAnimStarted || card.classList.contains('hide-anim')) {
      resetHideAnim(card);
    }
    hideNotified = false;
    return;
  }
  // 已通知隐藏过（窗口已隐藏），无需重复播放
  if (hideNotified) return;
  if (hideAnimStarted) return;
  hideAnimStarted = true;
  card.classList.add('hide-anim');
  const notify = () => {
    if (hideAnimStarted) {
      hideNotified = true;
      window.api.cardAutoHidden(ITEM_ID);
    }
    resetHideAnim(card);
  };
  // animationend 正常路径
  card.addEventListener('animationend', notify, { once: true });
  // 兜底：窗口不可见时 CSS 动画可能被暂停，animationend 不触发 → 超时后仍通知隐藏
  setTimeout(notify, 1600);
}

// 彻底清除消失动画状态（类 + 内联样式 + 强制重排），避免卡片卡在"消失中间态"
function resetHideAnim(card) {
  hideAnimStarted = false;
  card.classList.remove('hide-anim');
  card.style.animation = 'none';
  card.style.opacity = '';
  card.style.transform = '';
  card.style.filter = '';
  card.style.pointerEvents = '';
  // 强制重排：清除 animation 残留，让下次添加 hide-anim 时动画能重新播放
  void card.offsetWidth;
}

// 通用"点击反馈"动画：给卡片加弹跳动画 + 给数字/大字加颜色跳动动画
// animClass/bumpClass 分别对应打卡（绿）与减打卡（红）
function playBump(card, bumpTarget, animClass, bumpClass, durationMs) {
  const clearAnim = () => {
    card.classList.remove(animClass);
    if (bumpTarget) bumpTarget.classList.remove(bumpClass);
  };
  card.classList.remove(animClass);
  void card.offsetWidth;  // 强制重排，确保动画可重复触发
  card.classList.add(animClass);
  if (bumpTarget) {
    bumpTarget.classList.remove(bumpClass);
    void bumpTarget.offsetWidth;
    bumpTarget.classList.add(bumpClass);
  }
  // 动画播完即清理（比 setTimeout 可靠，隐藏窗口时定时器会被节流）
  card.addEventListener('animationend', clearAnim, { once: true });
  if (bumpTarget) bumpTarget.addEventListener('animationend', clearAnim, { once: true });
  // 兜底：若动画未播放（窗口隐藏）也清理
  setTimeout(clearAnim, durationMs);
}

/* ---------- 事件 ---------- */
function bindEvents() {
  document.getElementById('gear').addEventListener('click', (e) => {
    e.stopPropagation();
    window.api.openConfig();
  });

  // 点击主体打卡；右键减一次（不限次数 / 目标项）
  const mainEl = document.getElementById('main');
  mainEl.addEventListener('click', () => {
    // 打卡动画反馈：卡片弹起回弹 + 数字/大字变绿跳动
    const card = document.getElementById('card');
    const bumpTarget = document.getElementById('count') || document.getElementById('big');
    playBump(card, bumpTarget, 'check-anim', 'check-bump', 800);
    window.api.toggleCheckin(ITEM_ID);
  });
  mainEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // 减打卡动画反馈：卡片下沉回弹 + 数字/大字变红跳动
    const card = document.getElementById('card');
    const bumpTarget = document.getElementById('count') || document.getElementById('big');
    playBump(card, bumpTarget, 'minus-anim', 'bump', 800);
    window.api.minusCheckin(ITEM_ID);
  });

  // 左键按压反馈（仅 button 0，右键不触发，避免减打卡时出现奇怪缩放）
  mainEl.addEventListener('mousedown', (e) => {
    if (e.button === 0) mainEl.classList.add('pressing');
  });
  ['mouseup', 'mouseleave'].forEach((evt) => {
    mainEl.addEventListener(evt, (e) => {
      if (e.button === 0 || evt === 'mouseleave') mainEl.classList.remove('pressing');
    });
  });

  // 左下角锁头：点击锁定（禁拖拽）；解锁只能通过配置界面
  document.getElementById('lock').addEventListener('click', (e) => {
    e.stopPropagation();
    const item = (state && state.items || []).find((i) => i.id === ITEM_ID);
    if (item && item.locked) return;  // 已锁定：点击无效（需配置界面解锁）
    window.api.lockCard(ITEM_ID);
  });

  // 角标显隐：鼠标在对应角落区域才显示该角的图标
  setupCornerIcons();

  // 上边缘三点把手：JS 拖拽移动（锁定时禁用）
  const dragHandleEl = document.getElementById('dragHandle');
  dragHandleEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const item = (state && state.items || []).find((i) => i.id === ITEM_ID);
    if (item && item.locked) return;  // 锁定卡片禁止拖动
    window.api.dragStart(ITEM_ID, {
      startScreenX: e.screenX,
      startScreenY: e.screenY
    });
    const up = () => {
      window.api.dragEnd();
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mouseup', up);
  });

  // 右下角圆点手柄拖拽缩放
  const resizeEl = document.getElementById('resize');
  resizeEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const r = document.getElementById('card').getBoundingClientRect();
    window.api.resizeStart(ITEM_ID, {
      startX: e.screenX,
      startY: e.screenY,
      startW: r.width,
      startH: r.height
    });
    const up = () => {
      window.api.resizeEnd();
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mouseup', up);
  });
}

/* ---------- 角标显隐：鼠标在四角或上边缘 → 显示全部图标 ---------- */
const CORNER_ZONE = 44;   // 角落判定区域（像素）
const EDGE_ZONE = 26;     // 上边缘判定区域（像素）
function setupCornerIcons() {
  const card = document.getElementById('card');
  const gear = document.getElementById('gear');        // 右上
  const lock = document.getElementById('lock');        // 左上
  const resize = document.getElementById('resize');    // 右下
  const dragHandle = document.getElementById('dragHandle'); // 上中
  const icons = [gear, lock, resize, dragHandle];

  const clear = () => {
    icons.forEach((el) => el && el.classList.remove('corner-show'));
  };

  card.addEventListener('mousemove', (e) => {
    const r = card.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const w = r.width, h = r.height;
    // 四角 或 上边缘 → 显示全部图标
    const inCorner =
      (x <= CORNER_ZONE || x >= w - CORNER_ZONE) &&
      (y <= CORNER_ZONE || y >= h - CORNER_ZONE);
    const inTopEdge = y <= EDGE_ZONE;
    if (inCorner || inTopEdge) {
      icons.forEach((el) => el && el.classList.add('corner-show'));
    } else {
      clear();
    }
  });

  card.addEventListener('mouseleave', clear);
}

/* ---------- 初始化 ---------- */
async function init() {
  state = await window.api.getData();
  window.api.onDataChanged((data) => {
    state = data;
    render();
  });
  bindEvents();
  render();
  // 每 30 秒刷新一次（跨天自动更新）
  setInterval(() => { render(); }, 30000);
}

init();
