$ErrorActionPreference = "Stop"

$RepoOwner = "Sasidhar-7302"
$RepoName = "Ghost_Writer"
$ManifestUrl = "https://github.com/$RepoOwner/$RepoName/releases/latest/download/release-manifest.json"
$ExpectedExeName = "Ghost.Writer.Setup.exe"
$ExpectedInstallPath = Join-Path $env:LOCALAPPDATA "Programs\Ghost Writer\Ghost Writer.exe"
$TempRoot = Join-Path $env:TEMP "ghost-writer-install"

function Write-Step([string]$Message) {
    Write-Host "[Ghost Writer] $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
    Write-Host "[Ghost Writer] $Message" -ForegroundColor Red
    exit 1
}

function Ensure-SupportedPlatform {
    # Check if OS is Windows (handles PS 5.1 where $IsWindows is not defined)
    $isActuallyWindows = if (Get-Variable IsWindows -ErrorAction SilentlyContinue) { $IsWindows } else { $env:OS -eq "Windows_NT" }
    
    if (-not $isActuallyWindows) {
        Fail "This installer supports Windows only."
    }

    if ([Environment]::Is64BitOperatingSystem -ne $true) {
        Fail "Windows x64 is required."
    }
}

function Get-Manifest {
    try {
        return Invoke-RestMethod -Uri $ManifestUrl -Headers @{ "Cache-Control" = "no-cache" }
    } catch {
        Fail "Unable to download the release manifest from $ManifestUrl."
    }
}

function Resolve-WindowsAsset($Manifest) {
    $asset = $Manifest.assets | Where-Object {
        $_.platform -eq "windows" -and $_.arch -eq "x64" -and $_.kind -eq "nsis"
    } | Select-Object -First 1

    if (-not $asset) {
        Fail "No Windows x64 installer was published in the release manifest."
    }

    if ($asset.fileName -ne $ExpectedExeName) {
        Write-Step "Manifest selected $($asset.fileName). Continuing."
    }

    return $asset
}

function Stop-RunningApp {
    $processes = @("Ghost Writer", "GhostWriter", "ghost-writer")
    foreach ($name in $processes) {
        Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }
}

function Download-Installer([string]$Url, [string]$TargetPath) {
    Write-Step "Downloading installer..."
    try {
        Invoke-WebRequest -Uri $Url -OutFile $TargetPath
    } catch {
        Fail "Installer download failed. Check your network connection and GitHub release availability."
    }
}

function Verify-Checksum([string]$FilePath, [string]$ExpectedChecksum) {
    Write-Step "Verifying checksum..."
    $actual = (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $ExpectedChecksum.ToLowerInvariant()) {
        Remove-Item -LiteralPath $FilePath -Force -ErrorAction SilentlyContinue
        Fail "Checksum mismatch detected. The installer was not executed."
    }
}

function Run-Installer([string]$InstallerPath) {
    Write-Step "Running silent per-user installer..."
    $process = Start-Process -FilePath $InstallerPath -ArgumentList "/S" -PassThru -Wait
    if ($process.ExitCode -ne 0) {
        Fail "Installer exited with code $($process.ExitCode)."
    }
}

function Verify-Install {
    if (Test-Path -LiteralPath $ExpectedInstallPath) {
        Write-Step "Install verified at $ExpectedInstallPath"
        return
    }

    $fallback = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "Programs") -Filter "Ghost Writer.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($fallback) {
        Write-Step "Install verified at $($fallback.FullName)"
        return
    }

    Fail "Ghost Writer did not appear in the expected user-local install path."
}

try {
    Ensure-SupportedPlatform
    Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $TempRoot | Out-Null

    Write-Step "Fetching release manifest..."
    $manifest = Get-Manifest
    $asset = Resolve-WindowsAsset -Manifest $manifest
    $installerPath = Join-Path $TempRoot $asset.fileName

    Stop-RunningApp
    Download-Installer -Url $asset.latestUrl -TargetPath $installerPath
    Verify-Checksum -FilePath $installerPath -ExpectedChecksum $asset.checksumSha256
    Run-Installer -InstallerPath $installerPath
    Verify-Install

    Write-Host "[Ghost Writer] Install complete. Launch Ghost Writer from Start Menu or Desktop." -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
