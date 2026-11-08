$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "build failed" }

  npx electron-builder --win dir
  if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

  $pkg = Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json
  $dist = Join-Path $root "dist"
  $source = Join-Path $dist "win-unpacked"
  $zip = Join-Path $dist "网影猎手-$($pkg.version)-portable.zip"

  Compress-Archive -Path (Join-Path $source "*") -DestinationPath $zip -CompressionLevel Optimal -Force

  $item = Get-Item -LiteralPath $zip
  Write-Host ("Portable package: {0} ({1:N2} MB)" -f $item.FullName, ($item.Length / 1MB))
} finally {
  Pop-Location
}