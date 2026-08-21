# Checkin Desktop - attach window to the desktop layer
# Usage: powershell -File attach-to-desktop.ps1 <hwnd-as-decimal> <x> <y>
# The window becomes a child of the desktop host (Progman / WorkerW),
# so normal apps naturally cover it (遮罩) — same technique as Wallpaper Engine / Rainmeter.
param([string]$Hwnd, [int]$PosX = -1, [int]$PosY = -1)
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class DesktopHook {
  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr FindWindow(string cls, string win);
  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string win);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  private static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);

  public static string Attach(string hwndStr, int x, int y) {
    IntPtr hwnd = new IntPtr(long.Parse(hwndStr));
    IntPtr target = FindDesktopHost();
    if (target == IntPtr.Zero) return "FAIL:no-host";
    IntPtr prev = SetParent(hwnd, target);
    if (prev == IntPtr.Zero) return "FAIL:setparent err=" + Marshal.GetLastWin32Error();
    if (x >= 0 && y >= 0) {
      SetWindowPos(hwnd, IntPtr.Zero, x, y, 0, 0, 0x0001 | 0x0004 | 0x0040);
    }
    return "OK:parent=" + target.ToInt64();
  }

  private static IntPtr FindDesktopHost() {
    IntPtr progman = FindWindow("Progman", null);
    if (progman != IntPtr.Zero && FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) {
      return progman;
    }
    IntPtr host = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (h != progman && FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) {
        host = h;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return host;
  }
}
"@
$out = [DesktopHook]::Attach($Hwnd, $PosX, $PosY)
Write-Output $out
