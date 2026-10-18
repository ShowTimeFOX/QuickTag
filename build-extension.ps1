param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("chrome", "firefox")]
  [string]$Browser,
  [string]$Destination
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot

if (-not $Destination) {
  $Destination = Join-Path $projectRoot "dist\$Browser"
}

$destinationPath = [System.IO.Path]::GetFullPath($Destination)
$manifestPath = if ($Browser -eq "firefox") {
  Join-Path $projectRoot "manifests\firefox.json"
} else {
  Join-Path $projectRoot "manifest.json"
}

New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
foreach ($directory in @("assets", "data", "pages", "scripts", "styles")) {
  Copy-Item -Path (Join-Path $projectRoot $directory) `
    -Destination $destinationPath -Recurse -Force
}
Copy-Item -Path $manifestPath `
  -Destination (Join-Path $destinationPath "manifest.json") -Force

Write-Output "Built $Browser extension at $destinationPath"
