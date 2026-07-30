param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\\dist")
)

$ErrorActionPreference = "Stop"
$siteRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
$siteRootPath = $siteRoot.Path.TrimEnd([char]'\', [char]'/')
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)

if (Test-Path -LiteralPath $outputRoot) {
  Remove-Item -LiteralPath $outputRoot -Recurse -Force
}

New-Item -ItemType Directory -Path (Join-Path $outputRoot "server") -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $siteRoot "index.html") -Destination (Join-Path $outputRoot "index.html")
Copy-Item -LiteralPath (Join-Path $siteRoot "styles.css") -Destination (Join-Path $outputRoot "styles.css")
Copy-Item -LiteralPath (Join-Path $siteRoot "product-carousel.js") -Destination (Join-Path $outputRoot "product-carousel.js")
Copy-Item -LiteralPath (Join-Path $siteRoot "assets") -Destination (Join-Path $outputRoot "assets") -Recurse
Copy-Item -LiteralPath (Join-Path $siteRoot "support") -Destination (Join-Path $outputRoot "support") -Recurse
Copy-Item -LiteralPath (Join-Path $siteRoot "privacy") -Destination (Join-Path $outputRoot "privacy") -Recurse
Copy-Item -LiteralPath (Join-Path $siteRoot ".well-known") -Destination (Join-Path $outputRoot ".well-known") -Recurse

$pages = @{
  "/" = ([System.IO.File]::ReadAllText((Join-Path $siteRoot "index.html")))
  "/index.html" = ([System.IO.File]::ReadAllText((Join-Path $siteRoot "index.html")))
  "/support/" = ([System.IO.File]::ReadAllText((Join-Path $siteRoot "support\\index.html")))
  "/support/index.html" = ([System.IO.File]::ReadAllText((Join-Path $siteRoot "support\\index.html")))
  "/privacy/" = ([System.IO.File]::ReadAllText((Join-Path $siteRoot "privacy\\index.html")))
  "/privacy/index.html" = ([System.IO.File]::ReadAllText((Join-Path $siteRoot "privacy\\index.html")))
}

$contentTypes = @{
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".png" = "image/png"
  ".webp" = "image/webp"
  ".json" = "application/json; charset=utf-8"
}

$staticAssets = [ordered]@{
  "/product-carousel.js" = @{
    body = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes((Join-Path $siteRoot "product-carousel.js")))
    contentType = "application/javascript; charset=utf-8"
  }
}

Get-ChildItem -LiteralPath (Join-Path $siteRoot "assets") -File -Recurse | ForEach-Object {
  $extension = $_.Extension.ToLowerInvariant()
  $contentType = $contentTypes[$extension]
  if (-not $contentType) {
    throw "Unsupported static asset type: $($_.FullName)"
  }

  $relativePath = $_.FullName.Substring($siteRootPath.Length).TrimStart([char]'\', [char]'/').Replace('\', '/')
  $staticAssets["/$relativePath"] = @{
    body = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($_.FullName))
    contentType = $contentType
  }
}

$workerTemplate = Get-Content -LiteralPath (Join-Path $siteRoot "worker\\index.js") -Raw
$workerSource = $workerTemplate.Replace("__STATIC_SITE_PAGES__", (ConvertTo-Json -InputObject $pages -Compress -Depth 3))
$workerSource = $workerSource.Replace("__STATIC_SITE_STYLES__", (ConvertTo-Json -InputObject ([System.IO.File]::ReadAllText((Join-Path $siteRoot "styles.css"))) -Compress))
$workerSource = $workerSource.Replace("__STATIC_SITE_ASSETS__", (ConvertTo-Json -InputObject $staticAssets -Compress -Depth 3))
$workerSource = $workerSource.Replace("__APPLE_APP_SITE_ASSOCIATION__", (ConvertTo-Json -InputObject ([System.IO.File]::ReadAllText((Join-Path $siteRoot ".well-known\\apple-app-site-association"))) -Compress))
$workerSource = $workerSource.Replace("__ANDROID_ASSET_LINKS__", (ConvertTo-Json -InputObject ([System.IO.File]::ReadAllText((Join-Path $siteRoot ".well-known\\assetlinks.json"))) -Compress))
[System.IO.File]::WriteAllText((Join-Path $outputRoot "server\\index.js"), $workerSource, [System.Text.UTF8Encoding]::new($false))
