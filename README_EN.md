# Checkin Desktop - Desktop Check-in Widget

[中文](README.md)

A frosted-glass check-in widget that lives on your Windows desktop. Each check-in item is an independent card that you can freely place, resize and deeply customize.

---

## Quick Start

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

## Demo

### Click and Move

Click the card body to check in; drag the top bar of a card to move it.

![Click and Move demo](docs/demo-click-and-move.gif)

## Features

- **Exquisite acrylic material**: every card uses a semi-transparent frosted-glass look with CSS backdrop-filter blur, rounded corners and highlight borders for a refined acrylic finish; six theme colors, adjustable opacity and accent colors, with automatic light text on dark themes
- **Animation effects**: a three-stage disappear animation (confirm pop, shrink-and-rise, blur fade-out) plays when a goal is completed; progress fills and button interactions animate smoothly; card corners are GPU anti-aliased for clean, jagged-free edges
- **Configure once, persist forever, auto-start supported**: check-in items, card positions and appearance are persisted locally and survive restarts; a one-click auto-start script registers the app to run silently at Windows login, keeping cards on the desktop without manual launching
- **Low system footprint**: built on Electron but each card is an independent lightweight window with no background polling or network requests; fullscreen detection uses low-frequency system calls, keeping memory and CPU usage modest
- **Smart scene recognition**: cards auto-hide whenever another window is in focus. When you play a fullscreen game, watch a fullscreen video or give a presentation, the cards step aside and reappear instantly when you return to the desktop; desktop, wallpaper, taskbar, Rainmeter, Wallpaper Engine, Dock and other resident tool windows are automatically recognized and excluded, so no false hiding
