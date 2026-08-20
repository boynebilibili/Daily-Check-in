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

  document.getElementById('dot').style.background = accent;

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
  const enabled = item.type === 'goal' || item.autoHide;
  if (!enabled || !reached) {
    hideAnimStarted = false;
    return;
  }
  if (hideAnimStarted) return;
  hideAnimStarted = true;
  const card = document.getElementById('card');
  card.classList.add('hide-anim');
  const notify = () => {
    if (hideAnimStarted) window.api.cardAutoHidden(ITEM_ID);
    hideAnimStarted = false;
  };
  // animationend 正常路径
  card.addEventListener('animationend', notify, { once: true });
  // 兜底：窗口不可见时 CSS 动画可能被暂停，animationend 不触发 → 超时后仍通知隐藏
  setTimeout(notify, 1600);
}

/* ---------- 事件 ---------- */
function bindEvents() {
  document.getElementById('gear').addEventListener('click', (e) => {
    e.stopPropagation();
    window.api.openConfig();
  });

  // 点击主体打卡；右键减一次（不限次数 / 目标项）
  document.getElementById('main').addEventListener('click', () => {
    window.api.toggleCheckin(ITEM_ID);
  });
  document.getElementById('main').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.api.minusCheckin(ITEM_ID);
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
