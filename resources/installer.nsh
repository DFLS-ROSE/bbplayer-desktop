; 静默覆盖安装完成后自动启动应用
; 注意：Exec 不阻塞，安装器收尾后应用已在运行
!macro customInstall
  Exec '"$INSTDIR\BBPlayer.exe"'
!macroend
