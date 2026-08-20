# Checkin Desktop - 桌面打卡组件

一个常驻 Windows 桌面的圆角半透明亚克力打卡组件。每个打卡项都是一张独立卡片，可自由摆放、调整大小、深度定制。

<div align="center">

<details open>
<summary>中文</summary>

---

### 快速开始

环境要求：Node.js 18+（Windows 10 / 11）

```bash
# 1. 克隆仓库
git clone https://github.com/boynebilibili/Daily-Check-in.git
cd Daily-Check-in

# 2. 安装依赖
npm install

# 3. 启动
npm start
```

启动后：

1. 桌面上每张卡片独立显示，新卡片默认堆叠在屏幕右下角
2. 点击卡片右上角的齿轮按钮打开配置界面，添加或编辑打卡项
3. 在配置界面的布局标签页中，拖动卡片缩略块到你喜欢的位置
4. 点击卡片主体即可打卡，拖动右下角圆点手柄可自定义卡片大小

支持三种打卡方式：

- 每天一次：完成即打勾，再点取消
- 不限次数：自由打卡只记当天次数，右键可减一次
- 目标次数：设定目标，进度条按天/周/月统计，完成目标后当天自动消失

### 功能演示

![功能演示动图](docs/checkin-demo.gif)

### 项目特点

- **精美的亚克力材质**：每张卡片采用半透明磨砂玻璃效果，基于 CSS backdrop-filter 实现背景模糊，配合圆角裁剪与高光描边，呈现出精致的亚克力质感；支持六种主题色调、可调透明度与强调色，深色主题自动切换浅色文字
- **动画效果**：完成目标时卡片播放三段式消失动画（轻微放大确认、缩小上浮、模糊淡出）；进度条填充、按钮交互均有流畅过渡动画；卡片圆角由 GPU 抗锯齿裁剪，边缘平滑无锯齿
- **配置一次即可长时间存在，并支持自动启动**：打卡项、卡片位置与外观配置本地持久化，重启不丢失；提供一键开机自启脚本，登录 Windows 后自动静默运行，常驻桌面无需手动启动
- **系统占用比较低**：基于 Electron 但每个打卡项使用独立轻量窗口，无后台轮询网络请求；全屏检测采用低频系统调用，整体内存与 CPU 占用保持在较低水平
- **智能识别使用场景**：当其他窗口处于焦点时会自动隐藏。玩全屏游戏、看全屏视频或演示时，卡片自动让路，回到桌面立即恢复；自动识别并排除桌面、壁纸、任务栏、Rainmeter、Wallpaper Engine、Dock 等常驻工具窗口，不会误隐藏

</details>

<details>
<summary>English</summary>

---

### Quick Start

Requirements: Node.js 18+ (Windows 10 / 11)

```bash
# 1. Clone the repository
git clone https://github.com/boynebilibili/Daily-Check-in.git
cd Daily-Check-in

# 2. Install dependencies
npm install

# 3. Launch
npm start
```

After launching:

1. Each card is displayed independently on the desktop; new cards are stacked at the bottom-right of the screen by default
2. Click the gear button at the top-right of a card to open the config window and add or edit check-in items
3. In the Layout tab of the config window, drag card thumbnails to your preferred positions
4. Click the card body to check in; drag the dot handle at the bottom-right to resize the card

Three check-in modes are supported:

- Daily: check in once per day, click again to undo
- Unlimited: check in as many times as you like, counts recorded per day, right-click to decrement
- Goal: set a target, progress bar tracks daily / weekly / monthly stats, card auto-hides for the day once the goal is reached

### Demo

![Demo](docs/checkin-demo.gif)

### Features

- **Exquisite acrylic material**: every card uses a semi-transparent frosted-glass look with CSS backdrop-filter blur, rounded corners and highlight borders for a refined acrylic finish; six theme colors, adjustable opacity and accent colors, with automatic light text on dark themes
- **Animation effects**: a three-stage disappear animation (confirm pop, shrink-and-rise, blur fade-out) plays when a goal is completed; progress fills and button interactions animate smoothly; card corners are GPU anti-aliased for clean, jagged-free edges
- **Configure once, persist forever, auto-start supported**: check-in items, card positions and appearance are persisted locally and survive restarts; a one-click auto-start script registers the app to run silently at Windows login, keeping cards on the desktop without manual launching
- **Low system footprint**: built on Electron but each card is an independent lightweight window with no background polling or network requests; fullscreen detection uses low-frequency system calls, keeping memory and CPU usage modest
- **Smart scene recognition**: cards auto-hide whenever another window is in focus. When you play a fullscreen game, watch a fullscreen video or give a presentation, the cards step aside and reappear instantly when you return to the desktop; desktop, wallpaper, taskbar, Rainmeter, Wallpaper Engine, Dock and other resident tool windows are automatically recognized and excluded, so no false hiding

</details>

</div>
