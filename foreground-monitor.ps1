# Checkin Desktop - fullscreen window monitor
# Enumerates ALL visible top-level windows and reports those covering the
# primary work area (fullscreen). Output every 800ms:
#   N|classname;processname|classname;processname|...
#   (N = count of fullscreen-covering windows, N=0 means none)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
public static class FgWin {
  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
  public static string Scan(int waL, int waT, int waR, int waB) {
    List<string> hits = new List<string>();
    EnumWindows((h, l) => {
      if (IsWindowVisible(h)) {
        RECT r;
        if (GetWindowRect(h, out r)) {
          if (r.Left <= waL && r.Top <= waT && r.Right >= waR && r.Bottom >= waB) {
            StringBuilder cls = new StringBuilder(128);
            GetClassName(h, cls, 128);
            string proc = "";
            try {
              uint pid;
              GetWindowThreadProcessId(h, out pid);
              using (Process p = Process.GetProcessById((int)pid)) { proc = p.ProcessName; }
            } catch { }
            hits.Add(cls.ToString() + ";" + proc);
          }
        }
      }
      return true;
    }, IntPtr.Zero);
    if (hits.Count == 0) return "0";
    return hits.Count + "|" + string.Join("|", hits);
  }
}
"@
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
while ($true) {
  try {
    Write-Output ([FgWin]::Scan($wa.Left, $wa.Top, $wa.Right, $wa.Bottom))
  } catch {
    Write-Output "0"
  }
  Start-Sleep -Milliseconds 800
}
