' Checkin Desktop - background launcher
' Double-click this to start the app fully detached from any terminal.
' Closing the terminal window will NOT stop the check-in widget.
Set fso = CreateObject("Scripting.FileSystemObject")
Set ws = CreateObject("WScript.Shell")

' 自动定位脚本所在目录（脚本放在项目根目录）
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
ws.CurrentDirectory = appDir

' Run Electron directly so the launcher never opens or owns a terminal window.
electronExe = appDir & "\node_modules\electron\dist\electron.exe"
ws.Run Chr(34) & electronExe & Chr(34) & " .", 0, False
