# tools/card-avatar.ps1 — render a strategy-card image in the style of the community avatar generator
# (https://kurumiwww.github.io/stronghold-protocol-avatar/, repo KurumiWWW/stronghold-protocol-avatar).
#
# The generator composes: a round (95%) portrait, an edge fade to rgb(50,50,50), a teal tint with scanlines, and two
# overlay texts (112.png top-left "[R00] STRATEGY", 111.png bottom-left "STRONGHOLD PROTOCOL"); the orange badge
# (av-icon.png) is optional. This script rebuilds that composition from the repository's own art, so a card can be made
# without the website (whose cropper is hard to drive head-less and whose output is a screen capture).
#
# Usage:
#   powershell -File tools/card-avatar.ps1 -In <source.png> -Out <card.png> [-Size 360] [-Badge] [-Tint]
#     -In     the source image (a card screenshot or a portrait; a square is used as-is)
#     -Out    where to write the PNG (360x360 for a plugin's band icon: plugins/<id>/assets/images/band_*.png)
#     -Size   output edge in px (default 360, the size the shipped strategy cards use)
#     -Badge  also draw the orange av-icon.png badge in the top-right corner (off by default)
#     -Tint   also apply the generator's teal tint + scanlines (off by default: a source card already carries them;
#             pass it for a plain portrait)
#
# After replacing a plugin asset: node tools/keel.mjs pack <plugin-id>  (rewrites plugin.lock.json; never hand-edit it).
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Size = 360,
  [switch]$Badge,
  [switch]$Tint
)

Add-Type -AssemblyName System.Drawing
$assetDir = Join-Path $PSScriptRoot 'card-avatar'
$S = 512                       # compose at 512 then scale down: the overlay art is 2x-friendly
$bmp = New-Object System.Drawing.Bitmap $S, $S
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'HighQuality'
$g.InterpolationMode = 'HighQualityBicubic'
$g.PixelOffsetMode = 'HighQuality'
$g.Clear(([System.Drawing.Color]::FromArgb(255, 50, 50, 50)))

$src = [System.Drawing.Image]::FromFile((Resolve-Path $In))
$face = New-Object System.Drawing.Bitmap $S, $S
$fg = [System.Drawing.Graphics]::FromImage($face)
$fg.InterpolationMode = 'HighQualityBicubic'
$fg.PixelOffsetMode = 'HighQuality'
$fg.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $S, $S))
$fg.Dispose(); $src.Dispose()

$d = [int]($S * 0.95)
$x = [int](($S - $d) / 2)
$disc = New-Object System.Drawing.Rectangle $x, $x, $d, $d
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddEllipse($disc)
$g.SetClip($path)
$g.DrawImage($face, $disc)

if ($Tint) {
  $tint = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(64, 48, 219, 177))
  $g.FillRectangle($tint, $disc)
  $line = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(38, 48, 219, 177))
  for ($yy = $disc.Top; $yy -lt $disc.Bottom; $yy += 8) { $g.FillRectangle($line, $disc.Left, $yy, $disc.Width, 4) }
  $tint.Dispose(); $line.Dispose()
}
$g.ResetClip()

# the edge fade: transparent centre to the page colour, approximating the generator's radial gradient
$vg = New-Object System.Drawing.Drawing2D.PathGradientBrush ($path)
$vg.CenterColor = [System.Drawing.Color]::FromArgb(0, 50, 50, 50)
$vg.SurroundColors = @([System.Drawing.Color]::FromArgb(255, 50, 50, 50))
$vg.FocusScales = New-Object System.Drawing.PointF 0.46, 0.46
$g.FillPath($vg, $path)
$vg.Dispose()

function Overlay([System.Drawing.Image]$img, [double]$left, [double]$top, [double]$width) {
  $w = [int]($S * $width)
  $h = [int]($w * $img.Height / $img.Width)
  $g.DrawImage($img, [int]($S * $left), [int]($S * $top), $w, $h)
}
$i111 = [System.Drawing.Image]::FromFile((Join-Path $assetDir '111.png'))
$i112 = [System.Drawing.Image]::FromFile((Join-Path $assetDir '112.png'))
Overlay $i112 0.08 0.125 0.40
Overlay $i111 0.10 (0.90 - (0.40 * $i111.Height / $i111.Width)) 0.40
if ($Badge) {
  $badge = [System.Drawing.Image]::FromFile((Join-Path $assetDir 'av-icon.png'))
  Overlay $badge (1.06 - 0.40) -0.06 0.40
  $badge.Dispose()
}
$i111.Dispose(); $i112.Dispose()
$g.Dispose(); $face.Dispose()

$outBmp = New-Object System.Drawing.Bitmap $Size, $Size
$og = [System.Drawing.Graphics]::FromImage($outBmp)
$og.InterpolationMode = 'HighQualityBicubic'
$og.PixelOffsetMode = 'HighQuality'
$og.DrawImage($bmp, (New-Object System.Drawing.Rectangle 0, 0, $Size, $Size))
$og.Dispose(); $bmp.Dispose()
$outBmp.Save([System.IO.Path]::GetFullPath($Out), [System.Drawing.Imaging.ImageFormat]::Png)
$outBmp.Dispose()
Write-Output ("wrote " + $Out + " (" + $Size + "x" + $Size + ")")
