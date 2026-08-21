/* ---------- 状态 ---------- */
let state = null;
let editingId = null;
let selectedColor = '#7c9cf5';
let selectedTheme = '#f5f7fc';
let workArea = null;   // 主屏工作区

const $ = (sel) => document.querySelector(sel);

/* ================= 打卡项标签页 ================= */

function setFormVisible(visible) {
  $('#formWrap').classList.toggle('hidden', !visible);
  $('#addBtn').classList.toggle('hidden', visible);
}

function resetForm() {
  editingId = null;
  $('#formTitle').textContent = '添加打卡项';
  $('#name').value = '';
  $('#target').value = '8';
  $('#period').value = 'day';
  document.querySelector('input[name="type"][value="daily"]').checked = true;
  updateTypeUI();
  selectColor('#7c9cf5');
  selectTheme('#f5f7fc');
  setOpacity(12);  // 默认透明度 12%（对应不透明度 0.88）
  $('#autoHide').checked = false;
  $('#autoHideCount').value = '1';
  document.querySelector('input[name="fontSize"][value="medium"]').checked = true;
  document.querySelector('input[name="cardSize"][value="medium"]').checked = true;
}

function setOpacity(value) {
  // 滑块显示「透明度」百分比（0% 不透明 ~ 70% 很透）
  $('#opacity').value = String(value);
  $('#opacityValue').textContent = Math.round(value) + '%';
}

// 透明度百分比 → 存储的 opacity（不透明度）
function opacityToStore(transparencyPct) {
  return clamp01(1 - transparencyPct / 100);
}
// 存储的 opacity → 透明度百分比
function opacityToUi(opacity) {
  return Math.round((1 - opacity) * 100);
}
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function updateTypeUI() {
  const type = document.querySelector('input[name="type"]:checked').value;
  $('#goalFields').classList.toggle('hidden', type !== 'goal');
  // 目标次数：完成目标即自动隐藏（内置行为），不提供“完成后自动隐藏”选项
  $('#autoHideWrap').classList.toggle('hidden', type === 'goal');
  // 隐藏触发次数仅“不限次数”模式可调（每天一次固定 1 次）
  $('#autoHideCountField').classList.toggle('hidden', type !== 'counter');
  const tip = $('#autoHideTip');
  if (tip) {
    tip.textContent = type === 'counter'
      ? '当天打卡达到设定次数后自动消失，次日自动恢复显示'
      : '打卡后当天自动消失，次日自动恢复显示';
  }
}

function selectColor(color) {
  selectedColor = color;
  document.querySelectorAll('.swatch').forEach((s) => {
    s.classList.toggle('active', s.dataset.color === color);
  });
}

function selectTheme(theme) {
  selectedTheme = theme;
  document.querySelectorAll('.theme-chip').forEach((s) => {
    s.classList.toggle('active', s.dataset.theme === theme);
  });
}

function currentSize() {
  return document.querySelector('input[name="cardSize"]:checked').value;
}

function currentFont() {
  return document.querySelector('input[name="fontSize"]:checked').value;
}

/* ---------- 渲染列表 ---------- */
function renderItems() {
  const items = (state && state.items) || [];
  const list = $('#list');
  const empty = $('#emptyList');

  if (items.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = items
    .map((it) => {
      const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const meta = it.type === 'goal'
        ? `目标 ${it.target} 次 / ${it.period === 'day' ? '每天' : it.period === 'week' ? '每周' : '每月'}`
        : it.type === 'counter'
          ? '不限次数'
          : '每天一次';
      const sizeName = { small: '小', medium: '中', large: '大', custom: '自定义' }[it.card && it.card.size] || '中';
      const fontName = { small: '小', medium: '中', large: '大' }[it.fontSize] || '中';
      // 目标次数：完成目标即自动隐藏（内置）；其他模式：开启后才显示标签
      const autoHideTag = it.type === 'goal'
        ? ' · <b class="autohide-tag">完成后隐藏</b>'
        : (it.autoHide ? ' · <b class="autohide-tag">完成后隐藏' + (it.autoHideCount > 1 ? ` ${it.autoHideCount}次` : '') + '</b>' : '');
      const lockTag = it.locked ? ' · <b class="lock-tag">已锁定</b>' : '';
      const unlockBtn = it.locked
        ? `<button class="unlock" data-id="${it.id}">解锁</button>`
        : '';
      return `
        <div class="list-item" data-id="${it.id}">
          <span class="dot" style="background:${esc(it.color || '#7c9cf5')}"></span>
          <div class="info">
            <div class="name">${esc(it.name)}</div>
            <div class="meta">${meta} · 卡片 ${sizeName} · 字 ${fontName}${autoHideTag}${lockTag}</div>
          </div>
          <div class="actions">
            ${unlockBtn}
            <button class="edit" data-id="${it.id}">编辑</button>
            <button class="del" data-id="${it.id}">删除</button>
          </div>
        </div>`;
    })
    .join('');
}

/* ================= 布局标签页 ================= */

const CANVAS_W = 640;
const CANVAS_H = 400;

function layoutScale() {
  if (!workArea) return 0.2;
  return Math.min((CANVAS_W - 40) / workArea.width, (CANVAS_H - 40) / workArea.height);
}

function cardSizeOf(item) {
  const preset = { small: { w: 200, h: 110 }, medium: { w: 300, h: 170 }, large: { w: 420, h: 240 } };
  const card = item.card || {};
  if (preset[card.size]) return preset[card.size];
  return { w: parseInt(card.w, 10) || 300, h: parseInt(card.h, 10) || 170 };
}

function renderLayout() {
  const canvas = $('#canvas');
  if (!workArea) {
    canvas.innerHTML = '<div class="canvas-msg">正在获取屏幕信息…</div>';
    return;
  }
  const scale = layoutScale();
  const ox = (CANVAS_W - workArea.width * scale) / 2;
  const oy = (CANVAS_H - workArea.height * scale) / 2;

  const items = (state && state.items) || [];
  canvas.innerHTML = `
    <div class="wa" style="left:${ox}px;top:${oy}px;width:${workArea.width * scale}px;height:${workArea.height * scale}px"></div>
    ${items.map((it) => {
      const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const size = cardSizeOf(it);
      const card = it.card || {};
      const x = (card.x != null) ? card.x : workArea.x + workArea.width - size.w - 24;
      const y = (card.y != null) ? card.y : workArea.y + workArea.height - size.h - 24;
      const left = ox + (x - workArea.x) * scale;
      const top = oy + (y - workArea.y) * scale;
      return `
        <div class="lcard" data-id="${it.id}" data-color="${esc(it.color || '#7c9cf5')}"
             style="left:${left}px;top:${top}px;width:${Math.max(28, size.w * scale)}px;height:${Math.max(20, size.h * scale)}px">
          <span class="ldot" style="background:${esc(it.color || '#7c9cf5')}"></span>
          <span class="lname">${esc(it.name)}</span>
        </div>`;
    }).join('')}
  `;
}

/* ---------- 布局画布拖放 ---------- */
function bindLayoutDrag() {
  const canvas = $('#canvas');
  let dragging = null;

  canvas.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.lcard');
    if (!el || !workArea) return;
    e.preventDefault();
    // 统一用视口坐标（getBoundingClientRect），避免 offsetLeft 与 clientX 坐标系混用导致跳位
    const rect = el.getBoundingClientRect();
    dragging = {
      el,
      id: el.dataset.id,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top
    };
    el.classList.add('dragging');
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const scale = layoutScale();
    const ox = (CANVAS_W - workArea.width * scale) / 2;
    const oy = (CANVAS_H - workArea.height * scale) / 2;
    const canvasRect = canvas.getBoundingClientRect();
    let left = e.clientX - dragging.offsetX - canvasRect.left;
    let top = e.clientY - dragging.offsetY - canvasRect.top;
    left = Math.max(ox, Math.min(ox + workArea.width * scale - dragging.el.offsetWidth, left));
    top = Math.max(oy, Math.min(oy + workArea.height * scale - dragging.el.offsetHeight, top));
    dragging.el.style.left = left + 'px';
    dragging.el.style.top = top + 'px';
  });

  window.addEventListener('mouseup', async () => {
    if (!dragging) return;
    const { id, el } = dragging;
    dragging = null;
    el.classList.remove('dragging');
    // 用 mousemove 写入的 style 值（画布内坐标）换算回屏幕坐标
    const scale = layoutScale();
    const ox = (CANVAS_W - workArea.width * scale) / 2;
    const oy = (CANVAS_H - workArea.height * scale) / 2;
    const left = parseFloat(el.style.left);
    const top = parseFloat(el.style.top);
    const x = Math.round(workArea.x + (left - ox) / scale);
    const y = Math.round(workArea.y + (top - oy) / scale);
    await window.api.moveCard(id, { x, y });
  });
}

/* ================= 标签页切换 ================= */

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $('#panel-items').classList.toggle('hidden', tab !== 'items');
  $('#panel-layout').classList.toggle('hidden', tab !== 'layout');
  if (tab === 'layout') renderLayout();
}

/* ================= 事件 ================= */

function bindEvents() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  $('#addBtn').addEventListener('click', () => {
    resetForm();
    setFormVisible(true);
  });

  $('#cancelBtn').addEventListener('click', () => setFormVisible(false));

  document.querySelectorAll('input[name="type"]').forEach((r) => {
    r.addEventListener('change', updateTypeUI);
  });

  document.querySelectorAll('.swatch').forEach((s) => {
    s.addEventListener('click', () => selectColor(s.dataset.color));
  });

  document.querySelectorAll('.theme-chip').forEach((s) => {
    s.addEventListener('click', () => selectTheme(s.dataset.theme));
  });

  // 透明度滑块：实时更新百分比显示
  $('#opacity').addEventListener('input', () => {
    setOpacity(parseFloat($('#opacity').value));
  });

  $('#saveBtn').addEventListener('click', async () => {
    const type = document.querySelector('input[name="type"]:checked').value;
    const name = $('#name').value.trim();
    if (!name) { $('#name').focus(); return; }
    const cardSize = currentSize();
    const fontSize = currentFont();
    const t = parseFloat($('#opacity').value);
    const opacity = opacityToStore(isNaN(t) ? 12 : t);
    // 目标次数模式无此选项（完成目标即自动隐藏），不传 autoHide
    const autoHide = type === 'goal' ? undefined : $('#autoHide').checked;
    const autoHideCount = type === 'counter' ? (parseInt($('#autoHideCount').value, 10) || 1) : undefined;

    if (editingId) {
      const changes = { name, color: selectedColor, type, cardSize, fontSize, theme: selectedTheme, opacity };
      if (autoHide !== undefined) changes.autoHide = autoHide;
      if (autoHideCount !== undefined) changes.autoHideCount = autoHideCount;
      if (type === 'goal') {
        changes.target = parseInt($('#target').value, 10) || 1;
        changes.period = $('#period').value;
      }
      await window.api.updateItem({ id: editingId, changes });
    } else {
      const payload = { name, color: selectedColor, type, cardSize, fontSize, theme: selectedTheme, opacity };
      if (autoHide !== undefined) payload.autoHide = autoHide;
      if (autoHideCount !== undefined) payload.autoHideCount = autoHideCount;
      if (type === 'goal') {
        payload.target = parseInt($('#target').value, 10) || 1;
        payload.period = $('#period').value;
      }
      await window.api.addItem(payload);
    }
    setFormVisible(false);
  });

  $('#list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.classList.contains('unlock')) {
      // 快速解锁：仅锁定项显示此按钮
      await window.api.updateItem({ id, changes: { locked: false } });
    } else if (btn.classList.contains('del')) {
      if (confirm('确定删除这个打卡项吗？')) {
        await window.api.deleteItem(id);
      }
    } else if (btn.classList.contains('edit')) {
      const item = state.items.find((i) => i.id === id);
      if (!item) return;
      editingId = id;
      $('#formTitle').textContent = '编辑打卡项';
      $('#name').value = item.name;
      document.querySelector(`input[name="type"][value="${item.type}"]`).checked = true;
      updateTypeUI();
      if (item.type === 'goal') {
        $('#target').value = item.target;
        $('#period').value = item.period || 'day';
      }
      const sizeEl = document.querySelector(`input[name="cardSize"][value="${(item.card && item.card.size) || 'medium'}"]`);
      if (sizeEl) sizeEl.checked = true;
      const fontEl = document.querySelector(`input[name="fontSize"][value="${item.fontSize || 'medium'}"]`);
      if (fontEl) fontEl.checked = true;
      selectColor(item.color || '#7c9cf5');
      selectTheme(item.theme || '#f5f7fc');
      setOpacity(opacityToUi((item.opacity != null) ? item.opacity : 0.88));
      $('#autoHide').checked = !!item.autoHide;
      $('#autoHideCount').value = item.autoHideCount || 1;
      updateTypeUI();
      setFormVisible(true);
      $('#name').focus();
    }
  });

  bindLayoutDrag();
}

/* ================= 初始化 ================= */

async function init() {
  state = await window.api.getData();
  workArea = await window.api.getWorkArea();
  window.api.onDataChanged((data) => {
    state = data;
    renderItems();
    if (!$('#panel-layout').classList.contains('hidden')) renderLayout();
  });
  bindEvents();
  renderItems();
  renderLayout();
}

init();
