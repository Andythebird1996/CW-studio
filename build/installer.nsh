; Slår av electron-builders prosesssjekk helt — ingen dialog, bare drep og fortsett
!macro customCheckAppRunning
  nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Sleep 1000
!macroend

!macro customInit
  nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Sleep 1000
!macroend

!macro customUnInit
  nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Sleep 1000
!macroend
