!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!define CLI_PATH_REGISTRY_KEY "Software\FLAQ.AI\DeepSeek Harness"
!define CLI_PATH_REGISTRY_VALUE "CliPathRegistered"
!define CLI_PATH_DIRECTORY_VALUE "CliPathDirectory"

# This include is expanded before electron-builder inserts MUI_LANGUAGE, so the
# symbolic LANG_* constants do not exist yet. Use stable Windows LCIDs instead.
LangString CliPageTitle 2052 "命令行工具"
LangString CliPageTitle 1033 "Command-line tool"
LangString CliPageSubtitle 2052 "选择是否在终端中直接使用客户端内置的 dsh"
LangString CliPageSubtitle 1033 "Choose whether the desktop-managed dsh is available in terminals"
LangString CliPathCheckbox 2052 "将 dsh 添加到当前用户 PATH"
LangString CliPathCheckbox 1033 "Add dsh to the current-user PATH"
LangString CliPathDescription 2052 "不会注册 npm 或 pnpm，也不会修改 DSH_HOME。dsh 会跟随客户端中选择的数据目录；安装后请打开新的终端窗口。"
LangString CliPathDescription 1033 "npm, pnpm, and DSH_HOME are not changed. dsh follows the data directory selected in the desktop app. Open a new terminal after installation."
LangString CliConflict 2052 "检测到 PATH 中已有其他 dsh。此选项默认关闭；强制勾选会让客户端内置 dsh 优先。"
LangString CliConflict 1033 "Another dsh was found on PATH. This option stays off by default; selecting it makes the desktop-managed dsh take priority."
LangString CliPathFailure 2052 "无法更新当前用户 PATH。应用已正常安装，但 dsh 命令尚未注册。"
LangString CliPathFailure 1033 "The current-user PATH could not be updated. The app was installed, but dsh was not registered."
LangString AppProcessesRunning 2052 "检测到以下由 DeepSeek Harness 安装目录启动的进程。继续后，安装程序会先请求它们正常退出，随后关闭仍在运行的进程。"
LangString AppProcessesRunning 1033 "The following processes were started from the DeepSeek Harness installation. Continuing asks them to exit and then closes any that remain."
LangString AppProcessesRemain 2052 "仍有进程无法关闭。它们可能使用了更高权限。请根据下方的 PID 和路径手动关闭，然后重试。"
LangString AppProcessesRemain 1033 "Some processes could not be closed, possibly because they run with higher privileges. Close the listed PIDs and paths, then retry."
LangString AppProcessInspectionFailed 2052 "安装程序无法安全检查 DeepSeek Harness 进程。为避免损坏安装，本次操作已停止。"
LangString AppProcessInspectionFailed 1033 "The installer could not safely inspect DeepSeek Harness processes. Installation has stopped to avoid corrupting the application."

Var ProcessGuardOutput

!macro customCheckAppRunning
  # A fresh installation has no files that can be locked. Avoid invoking CIM
  # until an existing desktop executable or packaged runtime is present.
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" process_guard_inspect
  IfFileExists "$INSTDIR\resources\*.*" process_guard_inspect
  Goto process_guard_done

  process_guard_inspect:
  InitPluginsDir
  File /oname=$PLUGINSDIR\installer-process-guard.ps1 "${BUILD_RESOURCES_DIR}\installer-process-guard.ps1"
  System::Call 'kernel32::GetCurrentProcessId() i.r9'

  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\installer-process-guard.ps1" -Action inspect -InstallDirectory "$INSTDIR" -AppExecutable "${APP_EXECUTABLE_FILENAME}" -ExcludeProcessId $R9'
  Pop $0
  Pop $ProcessGuardOutput
  DetailPrint "$ProcessGuardOutput"

  ${If} $0 == 0
    Goto process_guard_done
  ${ElseIf} $0 == 10
    ${IfNot} ${Silent}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(AppProcessesRunning)$\r$\n$ProcessGuardOutput" IDOK process_guard_stop
      Quit
    ${EndIf}
    Goto process_guard_stop
  ${Else}
    MessageBox MB_RETRYCANCEL|MB_ICONSTOP "$(AppProcessInspectionFailed)$\r$\n$ProcessGuardOutput" /SD IDCANCEL IDRETRY process_guard_inspect
    Quit
  ${EndIf}

  process_guard_stop:
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\installer-process-guard.ps1" -Action stop -InstallDirectory "$INSTDIR" -AppExecutable "${APP_EXECUTABLE_FILENAME}" -ExcludeProcessId $R9'
  Pop $0
  Pop $ProcessGuardOutput
  DetailPrint "$ProcessGuardOutput"
  ${If} $0 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONSTOP "$(AppProcessesRemain)$\r$\n$ProcessGuardOutput" /SD IDCANCEL IDRETRY process_guard_inspect
    Quit
  ${EndIf}

  process_guard_done:
!macroend

!ifndef BUILD_UNINSTALLER
  Var CliPathCheckboxHandle
  Var CliPathRequested

  !macro customInit
    StrCpy $CliPathRequested "0"
    ReadRegDWORD $0 HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_REGISTRY_VALUE}"
    ${If} $0 == 1
      StrCpy $CliPathRequested "1"
    ${EndIf}
    ClearErrors
    ${GetOptions} $CMDLINE "/ADDCLI=" $1
    ${IfNot} ${Errors}
      ${If} $1 == "1"
        StrCpy $CliPathRequested "1"
      ${ElseIf} $1 == "0"
        StrCpy $CliPathRequested "0"
      ${EndIf}
    ${EndIf}
  !macroend

  !macro customPageAfterChangeDir
    Page custom CliPathPageCreate CliPathPageLeave
  !macroend

  # Electron Builder inserts customHeader after MUI2 and the selected languages.
  # Emit the page functions there so their MUI macros are available.
  !macro customHeader
    Function CliPathPageCreate
      ${If} ${Silent}
        Abort
      ${EndIf}
      !insertmacro MUI_HEADER_TEXT "$(CliPageTitle)" "$(CliPageSubtitle)"
      nsDialogs::Create 1018
      Pop $0
      ${If} $0 == error
        Abort
      ${EndIf}
      ${NSD_CreateCheckbox} 0 8u 100% 18u "$(CliPathCheckbox)"
      Pop $CliPathCheckboxHandle
      ${If} $CliPathRequested == "1"
        ${NSD_Check} $CliPathCheckboxHandle
      ${EndIf}
      ${NSD_CreateLabel} 12u 34u 94% 42u "$(CliPathDescription)"
      Pop $0
      nsExec::ExecToStack 'where.exe dsh'
      Pop $0
      Pop $1
      ${If} $0 == 0
        ${NSD_CreateLabel} 12u 80u 94% 36u "$(CliConflict)$\r$\n$1"
        Pop $0
        ${If} $CliPathRequested != "1"
          ${NSD_Uncheck} $CliPathCheckboxHandle
        ${EndIf}
      ${EndIf}
      nsDialogs::Show
    FunctionEnd

    Function CliPathPageLeave
      ${NSD_GetState} $CliPathCheckboxHandle $CliPathRequested
    FunctionEnd
  !macroend

  !macro customInstall
    # Re-read the opt-in in the instance that executes the install section.
    # Assisted installers can cross an outer/inner boundary after .onInit, so a
    # Var populated only by customInit is not a reliable silent-install input.
    ClearErrors
    ${GetOptions} $CMDLINE "/ADDCLI=" $1
    ${IfNot} ${Errors}
      ${If} $1 == "1"
        StrCpy $CliPathRequested "1"
      ${ElseIf} $1 == "0"
        StrCpy $CliPathRequested "0"
      ${EndIf}
    ${EndIf}
    DetailPrint "Desktop CLI PATH requested: $CliPathRequested"
    ${If} $CliPathRequested == "1"
      ReadRegStr $2 HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_DIRECTORY_VALUE}"
      ${If} $2 != ""
      ${AndIf} $2 != "$INSTDIR\resources\cli-bin"
        nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\cli-bin\manage-path.ps1" -Action remove -Directory "$2"'
      ${EndIf}
      nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\cli-bin\manage-path.ps1" -Action add -Directory "$INSTDIR\resources\cli-bin"'
      Pop $0
      Pop $1
      ${If} $0 == 0
        WriteRegDWORD HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_REGISTRY_VALUE}" 1
        WriteRegStr HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_DIRECTORY_VALUE}" "$INSTDIR\resources\cli-bin"
      ${Else}
        DetailPrint "Desktop CLI PATH registration failed (exit $0): $1"
        DeleteRegValue HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_REGISTRY_VALUE}"
        DeleteRegValue HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_DIRECTORY_VALUE}"
        MessageBox MB_OK|MB_ICONEXCLAMATION "$(CliPathFailure)$\r$\n$1" /SD IDOK
      ${EndIf}
    ${Else}
      ReadRegDWORD $0 HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_REGISTRY_VALUE}"
      ${If} $0 == 1
        nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\cli-bin\manage-path.ps1" -Action remove -Directory "$INSTDIR\resources\cli-bin"'
        DeleteRegValue HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_REGISTRY_VALUE}"
        DeleteRegValue HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_DIRECTORY_VALUE}"
      ${EndIf}
    ${EndIf}
  !macroend
!endif

!macro customUnInstall
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\cli-bin\manage-path.ps1" -Action remove -Directory "$INSTDIR\resources\cli-bin"'
  DeleteRegValue HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_REGISTRY_VALUE}"
  DeleteRegValue HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_DIRECTORY_VALUE}"
!macroend
