# Checkin Desktop - foreground window monitor
# Outputs foreground window info on stdout every 800ms:
#   left,top,right,bottom|classname|title|processname
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;
public static class FgWin {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
  public static string Get() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return "0,0,0,0|||";
    RECT r;
    if (!GetWindowRect(h, out r)) return "0,0,0,0|||";
    StringBuilder cls = new StringBuilder(128);
    GetClassName(h, cls, 128);
    StringBuilder title = new StringBuilder(256);
    GetWindowText(h, title, 256);
    string proc = "";
    try {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      using (Process p = Process.GetProcessById((int)pid)) { proc = p.ProcessName; }
    } catch { }
    return r.Left + "," + r.Top + "," + r.Right + "," + r.Bottom + "|" + cls.ToString() + "|" + title.ToString() + "|" + proc;
  }
}
"@
while ($true) {
  try {
    Write-Output ([FgWin]::Get())
  } catch {
    Write-Output "0,0,0,0|||"
  }
  Start-Sleep -Milliseconds 800
}
