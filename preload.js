const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 数据
  getData: () => ipcRenderer.invoke('data:get'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),

  // 打卡项增删改
  addItem: (payload) => ipcRenderer.invoke('item:add', payload),
  updateItem: (payload) => ipcRenderer.invoke('item:update', payload),
  deleteItem: (id) => ipcRenderer.invoke('item:delete', id),

  // 打卡
  toggleCheckin: (id) => ipcRenderer.invoke('checkin:toggle', id),
  minusCheckin: (id) => ipcRenderer.invoke('checkin:minus', id),

  // 卡片布局（每个打卡项独立卡片）
  moveCard: (id, pos) => ipcRenderer.invoke('card:move', { id, ...pos }),
  setCardSize: (id, size) => ipcRenderer.invoke('card:setSize', { id, size }),
  resizeStart: (id, info) => ipcRenderer.invoke('card:resizeStart', { id, ...info }),
  resizeEnd: () => ipcRenderer.invoke('card:resizeEnd'),

  // 目标完成后自动隐藏（动画播完通知主进程）
  cardAutoHidden: (id) => ipcRenderer.invoke('card:autoHidden', id),

  // 屏幕
  getWorkArea: () => ipcRenderer.invoke('screen:workarea'),

  // 配置窗口
  openConfig: () => ipcRenderer.invoke('config:open'),

  // 数据变化订阅
  onDataChanged: (cb) => {
    ipcRenderer.on('data:changed', (event, data) => cb(data));
  }
});
