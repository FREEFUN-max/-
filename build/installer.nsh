!define /ifndef EK_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"

!macro customInit
  Push $R8
  Push $R9

  ReadRegStr $R8 HKCU "${EK_UNINSTALL_KEY}" "UninstallString"
  ReadRegStr $R9 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"

  ${If} $R8 != ""
    ${If} $R9 == ""
      DeleteRegKey HKCU "${EK_UNINSTALL_KEY}"
      DeleteRegKey HKCU "${INSTALL_REGISTRY_KEY}"
    ${ElseIfNot} ${FileExists} "$R9\Uninstall ${PRODUCT_FILENAME}.exe"
      DeleteRegKey HKCU "${EK_UNINSTALL_KEY}"
      DeleteRegKey HKCU "${INSTALL_REGISTRY_KEY}"
    ${EndIf}
  ${EndIf}

  SetRegView 32
  ReadRegStr $R8 HKLM "${EK_UNINSTALL_KEY}" "UninstallString"
  ReadRegStr $R9 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"

  ${If} $R8 == ""
    SetRegView 64
    ReadRegStr $R8 HKLM "${EK_UNINSTALL_KEY}" "UninstallString"
    ReadRegStr $R9 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${EndIf}

  ${If} $R8 != ""
    ${If} $R9 == ""
      DeleteRegKey HKLM "${EK_UNINSTALL_KEY}"
      DeleteRegKey HKLM "${INSTALL_REGISTRY_KEY}"
    ${ElseIf} ${FileExists} "$R9\Uninstall ${PRODUCT_FILENAME}.exe"
      MessageBox MB_YESNO|MB_ICONQUESTION "An older copy of ekoloko was found on this computer.$\n$\nRemove it so you only have one copy? Your saved login and game progress will be kept." /SD IDYES IDNO ek_skip_old

      CopyFiles /SILENT "$R9\Uninstall ${PRODUCT_FILENAME}.exe" "$PLUGINSDIR\ek-old-uninstall.exe"

      IfFileExists "$PLUGINSDIR\ek-old-uninstall.exe" 0 ek_fallback

      ExecWait '"$PLUGINSDIR\ek-old-uninstall.exe" /S _?=$R9'
      Delete "$PLUGINSDIR\ek-old-uninstall.exe"
      Goto ek_after_uninst

      ek_fallback:
        ExecWait '$R8 /S'

      ek_after_uninst:
        RMDir /r "$R9"
        DeleteRegKey HKLM "${EK_UNINSTALL_KEY}"
        DeleteRegKey HKLM "${INSTALL_REGISTRY_KEY}"

      ek_skip_old:
    ${Else}
      DeleteRegKey HKLM "${EK_UNINSTALL_KEY}"
      DeleteRegKey HKLM "${INSTALL_REGISTRY_KEY}"
    ${EndIf}
  ${EndIf}

  SetRegView 64

  Pop $R9
  Pop $R8
!macroend