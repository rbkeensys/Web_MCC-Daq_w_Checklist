' MCC Web App Launcher (Silent) - Windows VBScript
' This launches the server and browser without showing console windows
' Double-click this file to start the app silently

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script is located
strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Change to script directory
objShell.CurrentDirectory = strScriptPath

' Check if virtual environment exists
strVenvPath = strScriptPath & "\.venv\Scripts\python.exe"
If objFSO.FileExists(strVenvPath) Then
    strPython = """" & strVenvPath & """"
Else
    strPython = "python"
End If

' Start the Python server (hidden window)
strServerPath = strScriptPath & "\server\server.py"
objShell.Run strPython & " """ & strServerPath & """", 0, False

' Wait 3 seconds for server to start
WScript.Sleep 3000

' Open the browser
objShell.Run "http://127.0.0.1:8000", 1, False

' Show notification (optional)
' MsgBox "MCC Web App started!" & vbCrLf & vbCrLf & "Server is running at http://127.0.0.1:8000" & vbCrLf & vbCrLf & "To stop the server, use Task Manager to end the Python process.", vbInformation, "MCC Web App"
