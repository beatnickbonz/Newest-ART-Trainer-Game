param([int]$Port = 8124)

# Static server rooted at the v2 edition, with /assets/* falling back to the
# shared ../assets folder (sprites + icons are shared with the original build).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$parent = Split-Path -Parent $root

$mime = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "application/javascript; charset=utf-8";
  ".css" = "text/css; charset=utf-8"; ".json" = "application/json; charset=utf-8";
  ".png" = "image/png"; ".jpg" = "image/jpeg"; ".svg" = "image/svg+xml";
  ".ico" = "image/x-icon"; ".woff2" = "font/woff2"; ".map" = "application/json"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving v2 ($root) at http://localhost:$Port/  (assets -> $parent\assets)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext(); $req = $ctx.Request; $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
      if ($rel -like "assets/*") { $full = Join-Path $parent $rel } else { $full = Join-Path $root $rel }
      if (Test-Path $full -PathType Container) { $full = Join-Path $full "index.html" }
      if (Test-Path $full -PathType Leaf) {
        $ext = [IO.Path]::GetExtension($full).ToLower(); $ct = $mime[$ext]; if (-not $ct) { $ct = "application/octet-stream" }
        $bytes = [IO.File]::ReadAllBytes($full)
        $res.ContentType = $ct
        $res.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else { $res.StatusCode = 404; $msg = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $rel"); $res.OutputStream.Write($msg, 0, $msg.Length) }
    } catch { try { $res.StatusCode = 500 } catch {} }
    finally { try { $res.OutputStream.Close() } catch {} }
  }
} finally { $listener.Stop() }
