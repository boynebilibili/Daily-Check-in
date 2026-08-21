' Checkin Desktop - background launcher
' Double-click this to start the app fully detached from any terminal.
' Closing the terminal window will NOT stop the check-in widget.
Set fso = CreateObject("Scripting.FileSystemObject")
Set ws = CreateObject("WScript.Shell")

' 自动定位脚本所在目录（脚本放在项目根目录）
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
ws.CurrentDirectory = appDir

' Run hidden (0) and do not wait (False): process runs independently
ws.Run "cmd /c npm start", 0, False
