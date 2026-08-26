!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!define CLI_PATH_REGISTRY_KEY "Software\FLAQ.AI\DeepSeek Harness"
!define CLI_PATH_REGISTRY_VALUE "CliPathRegistered"
!define CLI_PATH_DIRECTORY_VALUE "CliPathDirectory"

LangString CliPageTitle ${LANG_SIMPCHINESE} "命令行工具"
LangString CliPageTitle ${LANG_ENGLISH} "Command-line tool"
LangString CliPageSubtitle ${LANG_SIMPCHINESE} "选择是否在终端中直接使用客户端内置的 dsh"
LangString CliPageSubtitle ${LANG_ENGLISH} "Choose whether the desktop-managed dsh is available in terminals"
LangString CliPathCheckbox ${LANG_SIMPCHINESE} "将 dsh 添加到当前用户 PATH"
LangString CliPathCheckbox ${LANG_ENGLISH} "Add dsh to the current-user PATH"
LangString CliPathDescription ${LANG_SIMPCHINESE} "不会注册 npm 或 pnpm，也不会修改 DSH_HOME。dsh 会跟随客户端中选择的数据目录；安装后请打开新的终端窗口。"
LangString CliPathDescription ${LANG_ENGLISH} "npm, pnpm, and DSH_HOME are not changed. dsh follows the data directory selected in the desktop app. Open a new terminal after installation."
LangString CliConflict ${LANG_SIMPCHINESE} "检测到 PATH 中已有其他 dsh。此选项默认关闭；强制勾选会让客户端内置 dsh 优先。"
LangString CliConflict ${LANG_ENGLISH} "Another dsh was found on PATH. This option stays off by default; selecting it makes the desktop-managed dsh take priority."
LangString CliPathFailure ${LANG_SIMPCHINESE} "无法更新当前用户 PATH。应用已正常安装，但 dsh 命令尚未注册。"
LangString CliPathFailure ${LANG_ENGLISH} "The current-user PATH could not be updated. The app was installed, but dsh was not registered."

!ifndef BUILD_UNINSTALLER
  Var CliPathCheckboxHandle
  Var CliPathRequested

  !macro customInit
    StrCpy $CliPathRequested "0"
    ReadRegDWORD $0 HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_REGISTRY_VALUE}"
    ${If} $0 == 1
      StrCpy $CliPathRequested "1"
    ${EndIf}
    ${GetParameters} $0
    ClearErrors
    ${GetOptions} $0 "/ADDCLI=" $1
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

  !macro customInstall
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
        DeleteRegValue HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_REGISTRY_VALUE}"
        DeleteRegValue HKCU "${CLI_PATH_REGISTRY_KEY}" "${CLI_PATH_DIRECTORY_VALUE}"
        MessageBox MB_OK|MB_ICONEXCLAMATION "$(CliPathFailure)$\r$\n$1"
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
