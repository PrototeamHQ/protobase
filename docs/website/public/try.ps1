# Starts a local Protobase with workflows on. Paste this line into Win+R, cmd or PowerShell:
#   powershell -c "irm https://docs.protobase.net/try.ps1|iex"
# It keeps protobase-try.exe from the latest release in %LOCALAPPDATA%\Protobase\automations, downloads it again when a
# newer one is out, and runs it there; the exe does the rest. To remove everything, stop it and delete that folder.
& {
  $ErrorActionPreference = 'Stop'
  # Windows PowerShell 5.1 downloads many times slower while it draws a progress bar.
  $ProgressPreference = 'SilentlyContinue'
  $release = 'https://github.com/PrototeamHQ/protobase/releases/latest/download'
  $dir = Join-Path $env:LOCALAPPDATA 'Protobase\automations'
  try {
    $exe = Join-Path $dir 'protobase-try.exe'
    $versionFile = Join-Path $dir 'protobase-try.version'
    New-Item -ItemType Directory -Force $dir | Out-Null
    $have = if ((Test-Path $exe) -and (Test-Path $versionFile)) { (Get-Content $versionFile -Raw).Trim() } else { '' }
    $latestFile = Join-Path $dir 'latest.version'
    try {
      Invoke-WebRequest -UseBasicParsing "$release/protobase-try.version" -OutFile $latestFile
      $latest = (Get-Content $latestFile -Raw).Trim()
      Remove-Item $latestFile
    } catch {
      # Offline, a copy at hand runs as it is.
      if (-not $have) { throw }
      $latest = $have
    }
    if ($latest -ne $have) {
      Write-Host 'Downloading Protobase (about 45 MB)...'
      $zip = Join-Path $dir 'protobase-try.zip'
      Invoke-WebRequest -UseBasicParsing "$release/protobase-try.zip" -OutFile $zip
      Expand-Archive -Force $zip $dir
      Remove-Item $zip
      Set-Content -Path $versionFile -Value $latest -NoNewline
    }
    $env:PROTOBASE_HOME = $dir
    & $exe
    if ($LASTEXITCODE) { throw "Protobase stopped with exit code $LASTEXITCODE" }
  } catch {
    Write-Host "Protobase stopped: $_" -ForegroundColor Red
    Read-Host 'Press Enter to close'
  }
}
