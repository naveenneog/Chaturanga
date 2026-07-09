<#
  Build a signed, installable Chaturanga release APK (Capacitor + Android).

  - Syncs the current web/ into the Android project (npx cap sync android).
  - Ensures the release build is signed with the debug key (idempotent patch of
    android/app/build.gradle) so the APK installs directly.
  - Builds assembleRelease and copies the result to Chaturanga-v<version>.apk.

  Prereqs: JDK 21 (Eclipse Adoptium), Android SDK (platforms 34/35), Node/npm.
  Usage:  powershell -File tooling\build_apk.ps1 [-Version 1.0.0]
#>
param([string]$Version = "1.1.0")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# Toolchain
$jdk21 = Get-ChildItem "C:\Program Files\Eclipse Adoptium\jdk-21*\bin\java.exe" -EA SilentlyContinue | Select-Object -First 1
if ($jdk21) { $env:JAVA_HOME = (Split-Path (Split-Path $jdk21.FullName)) }
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "ANDROID_HOME=$env:ANDROID_HOME"

# Ensure the Android platform exists
if (!(Test-Path "$root\android")) {
  Write-Host "android/ missing -> npx cap add android"
  npx --yes cap add android
}

# Sync current web assets into the native project
npx --yes cap copy android

# Regenerate app icons + splash from resources/ (so branding survives android/ regen)
if (Test-Path "$root\resources\logo.png") {
  Write-Host "generating app icons + splash from resources/"
  npx --yes @capacitor/assets generate --assetPath resources --android
}

# Set the app version (write BOM-free; a UTF-8 BOM breaks Groovy parsing of build.gradle)
$gradle = "$root\android\app\build.gradle"
function Write-NoBom([string]$path, [string]$text) {
  [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}
$g = (Get-Content $gradle -Raw).TrimStart([char]0xFEFF)
$g = [regex]::Replace($g, 'versionName "[^"]*"', ('versionName "{0}"' -f $Version))
# Derive a monotonic integer versionCode from the semver (1.1.0 -> 10100) so upgrades install over old builds
$vp = $Version.Split('.')
$vcode = [int]$vp[0] * 10000 + [int]$vp[1] * 100 + [int]$vp[2]
$g = [regex]::Replace($g, 'versionCode \d+', ('versionCode {0}' -f $vcode))
# Ensure the release build is signed with the debug key (idempotent)
if ($g -notmatch "signingConfig signingConfigs.getByName\('debug'\)") {
  $g = $g -replace "(release\s*\{)", "`$1`r`n            signingConfig signingConfigs.getByName('debug')"
  Write-Host "patched release signingConfig -> debug key"
}
Write-NoBom (Resolve-Path $gradle).Path $g

# local.properties (SDK location)
$lp = "$root\android\local.properties"
if (!(Test-Path $lp)) { "sdk.dir=$($env:ANDROID_HOME -replace '\\','\\')" | Out-File -Encoding ascii $lp }

# Build (fail loudly instead of shipping a stale APK)
Push-Location "$root\android"
try { & .\gradlew.bat --no-daemon assembleRelease; $code = $LASTEXITCODE }
finally { Pop-Location }
if ($code -ne 0) { throw "gradle assembleRelease failed (exit $code) - not copying a stale APK" }

# Collect the APK
$apk = Get-ChildItem "$root\android\app\build\outputs\apk\release\*.apk" | Select-Object -First 1
if (!$apk) { throw "release APK not found" }
$dest = "$root\Chaturanga-v$Version.apk"
Copy-Item $apk.FullName $dest -Force
$mb = [math]::Round((Get-Item $dest).Length / 1MB, 1)
Write-Host "`nBUILT $dest ($mb MB), signed with the debug key."
