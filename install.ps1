# ==========================================
# Ghost Writer: Professional Windows Install
# ==========================================

$repo = "Sasidhar-7302/Ghost_Writer"
$url = "https://github.com/$repo/releases/latest/download/Ghost.Writer.Setup.exe"
$outPath = "$env:TEMP\GhostWriterInstaller.exe"

Write-Host "Ghost Writer Enterprise: Initializing Download..." -ForegroundColor Blue

Try {
    Invoke-WebRequest -Uri $url -OutFile $outPath
    Write-Host "Download complete. Launching installer..." -ForegroundColor Green
    Start-Process -FilePath $outPath -Wait
    Write-Host "Installation cycle finished." -ForegroundColor Cyan
} Catch {
    Write-Host "Error: Failed to download Ghost Writer. Check your internet or GitHub repo status." -ForegroundColor Red
} Finally {
    If (Test-Path $outPath) { Remove-Item $outPath }
}
