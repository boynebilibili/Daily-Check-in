# Checkin Desktop · 桌面打卡组件

一个常驻 Windows 桌面的圆角半透明亚克力打卡组件。每个打卡项都是**一张独立卡片**，可自由摆放、调整大小、深度定制，配置界面实时同步。

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Electron](https://img.shields.io/badge/Electron-30+-47848F)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D6)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ 功能特性

### 独立卡片（每个打卡项一张）
- 每张卡片独立窗口：圆角磨砂玻璃材质（半透明 + `backdrop-filter` 模糊）
- 窗口按卡片尺寸裁剪成圆角形状，视觉边缘由 GPU 抗锯齿的 `clip-path` 提供，无锯齿
- **中间超大字**强调打卡内容，下部进度条 + 数字
- 拖动卡片顶部条移动位置（自动记忆）；拖动右下角**圆点手柄**自由调整大小
- 置顶显示、不占任务栏、圆角外区域鼠标穿透

### 三种打卡方式
| 方式 | 说明 |
|---|---|
| **每天一次** | 完成即打勾，再点取消 |
| **不限次数** | 自由打卡只记当天次数，**右键可减一次** |
| **目标次数** | 设定目标，进度条按天 / 周 / 月统计，**完成目标后当天自动消失** |

### 深度定制
- **强调色**：圆点 / 进度条 / 完成色
- **卡片色调**：冰川蓝 / 暖杏 / 薄荷 / 樱粉 / 雾紫 / **暗夜**（深色卡片，文字自动变浅）
- **背景透明度**：0% ~ 70% 可调（磨砂感 vs 阅读性）
- **字体大小**：小 / 中 / 大（中间大字）
- **卡片大小**：小 200×110 / 中 300×170 / 大 420×240 / 自定义
- **完成后自动隐藏**：可设置触发次数（默认 1），达到后播放消失动画，次日自动恢复

### 其他
- **布局画布**：配置界面按屏幕比例显示缩略图，直接拖动卡片到满意位置
- **全屏自动隐藏**：其他应用全屏时（游戏 / 视频）自动隐藏卡片，回到桌面自动恢复
  （自动排除桌面、壁纸、任务栏、Rainmeter、Wallpaper Engine、Dock 等常驻工具）
- **开机自启**：一键脚本注册，无需打包安装
- 数据本地持久化（`data.json`），无需联网
- 系统托盘：打开配置 / 显示隐藏所有卡片 / 退出

## 📸 截图

<!-- 在此添加你的截图：
![主界面](docs/screenshot-main.png)
![配置界面](docs/screenshot-config.png)
-->

## 🚀 快速开始

环境要求：**Node.js 18+**（Windows 10 / 11）

```bash
# 1. 克隆仓库
git clone https://github.com/<你的用户名>/checkin-desktop.git
cd checkin-desktop

# 2. 安装依赖
npm install

# 3. 启动
npm start
```

启动后：
1. 桌面上每张卡片独立显示（新卡片默认堆叠在屏幕右下角）
2. 点击卡片右上角 **⚙** 打开配置界面，添加 / 编辑打卡项
3. 在配置界面的 **布局** 标签页中，拖动卡片缩略块到你喜欢的位置
4. 点击卡片主体即可打卡；拖动右下角圆点手柄自定义大小

## ⚙️ 开机自启

无需打包成 exe，使用启动触发器脚本（Windows 启动文件夹方式，无需管理员权限）：

1. 双击运行 **`setup-autostart.bat`**（注册开机自启，只需一次）
   - 会在启动文件夹（`%APPDATA%\...\Startup`）创建启动脚本，登录 Windows 后自动静默运行
2. 取消自启：双击运行 **`remove-autostart.bat`**

> ⚠️ 注意：脚本内默认固定了项目路径 `D:\1project\Daily Check-in`，
> 如果你的项目在其他位置，请用文本编辑器打开 `setup-autostart.bat` 修改 `APP_DIR` 一行。

## 🗂️ 项目结构

```
checkin-desktop/
├─ main.js                 # Electron 主进程：卡片窗口管理、数据、托盘、IPC
├─ preload.js              # 安全桥接 IPC
├─ data.json               # 本地数据（首次运行自动生成，已被 gitignore）
├─ foreground-monitor.ps1  # 前台窗口监控（全屏自动隐藏）
├─ setup-autostart.bat     # 开机自启注册脚本
├─ remove-autostart.bat    # 取消开机自启
├─ config/                 # 配置界面（打卡项 + 布局画布）
│  ├─ index.html
│  ├─ style.css
│  └─ renderer.js
└─ widget/                 # 桌面卡片（每打卡项一个窗口）
   ├─ index.html
   ├─ style.css
   └─ renderer.js
```

## 🧠 技术要点

- **圆角无锯齿**：透明窗口的 `backdrop-filter` 模糊区域是矩形的，主进程用 `setShape()` 裁剪窗口形状（负责鼠标穿透），视觉边缘由 CSS `clip-path: inset(0 round 20px)` 提供 GPU 抗锯齿
- **全屏检测**：常驻 PowerShell 进程每 0.8s 读取前台窗口信息（矩形 + 类名 + 进程名），排除系统桌面 / 壁纸 / 任务栏 / 常驻工具后判定全屏
- **完成自动隐藏**：目标达成后卡片播放三段式消失动画（放大确认 → 缩小上浮 → 模糊淡出），动画结束隐藏窗口；主进程每分钟评估一次，跨天自动恢复显示
- **崩溃防御**：主进程全局异常兜底 + 渲染进程崩溃自动 reload

## 📦 数据模型

`data.json` 中每个打卡项：

```json
{
  "id": "id_xxx",
  "type": "daily | counter | goal",
  "name": "喝水",
  "color": "#7c9cf5",
  "fontSize": "small | medium | large",
  "theme": "#f5f7fc",
  "opacity": 0.88,
  "autoHide": true,
  "autoHideCount": 1,
  "card": {
    "size": "small | medium | large | custom",
    "w": 300, "h": 170,
    "x": 900, "y": 300
  }
}
```

## 🛠️ 开发

```bash
# 语法检查
node --check main.js
node --check widget/renderer.js
node --check config/renderer.js

# 运行
npm start
```

## 📄 License

[MIT](LICENSE)
