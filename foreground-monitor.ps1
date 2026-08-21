# Checkin Desktop - fullscreen window monitor
# Checks only the foreground window and reports when it covers the
# primary work area. Output every 100ms:
#   N|classname;processname
#   (N = 1 when the foreground window covers the work area, 0 otherwise)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
public static class FgWin {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
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
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero || !IsWindowVisible(h)) return "0";
    RECT r;
    if (!GetWindowRect(h, out r) || r.Left > waL || r.Top > waT || r.Right < waR || r.Bottom < waB) return "0";
    StringBuilder cls = new StringBuilder(128);
    GetClassName(h, cls, 128);
    string proc = "";
    try {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      using (Process p = Process.GetProcessById((int)pid)) { proc = p.ProcessName; }
    } catch { }
    return "1|" + cls.ToString() + ";" + proc;
  }
}
"@
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
while ($true) {
  try {
    Write-Output ([FgWin]::Scan($wa.Left, $wa.Top, $wa.Right, $wa.Bottom))
  }
  catch {
    Write-Output "0"
  }
  Start-Sleep -Milliseconds 100
}
