$ErrorActionPreference = 'Stop'

# Allegro · Windows 构建
# 产出：dist\Allegro.exe（单文件，界面资源内置）
#       dist\Allegro-Setup-v0.2.4.exe（安装器）
#       dist\Allegro-v0.2.4-portable.zip（绿色版）

$root      = $PSScriptRoot
$projRoot  = Split-Path $root -Parent
$appDir    = Join-Path $projRoot 'app'
$dist      = Join-Path $projRoot 'dist'
$out       = Join-Path $root 'build'
$assets    = Join-Path $root 'assets'
$version   = '0.5.2a'

# 工具链目录：环境变量 $env:ABBEYROAD_WIN_TOOLS 或本地 build.local.ps1 覆盖，
# 仓库里不留私人路径（Roslyn 编译器 + WebView2 SDK 解出来的 DLL）。
$bt = if ($env:ABBEYROAD_WIN_TOOLS) { $env:ABBEYROAD_WIN_TOOLS } else { Join-Path $HOME '.build-tools' }
$localCfg = Join-Path $root 'build.local.ps1'
if (Test-Path $localCfg) { . $localCfg }   # 本地私有覆盖（不入库）

$roslyn    = Join-Path $bt 'roslyn\csc.exe'
$wv2       = Join-Path $bt 'webview2'
$fx        = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'

foreach ($p in @($roslyn, (Join-Path $wv2 'lib\Microsoft.Web.WebView2.Core.dll'),
                 (Join-Path $wv2 'lib\Microsoft.Web.WebView2.WinForms.dll'),
                 (Join-Path $wv2 'WebView2Loader.dll'))) {
    if (-not (Test-Path $p)) { throw "缺少构建依赖：$p" }
}

New-Item -ItemType Directory -Force -Path $out, $dist, $assets | Out-Null
Get-ChildItem $out -Recurse -File | Remove-Item -Force -ErrorAction SilentlyContinue

# 1) 图标
if (-not (Test-Path (Join-Path $assets 'abbeyroad.ico'))) {
    Write-Host '== 生成图标 =='
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'tools\make_icon.ps1')
}
$ico = Join-Path $assets 'abbeyroad.ico'

# DPI 感知清单（PerMonitorV2）：不带上的话进程会被系统整体位图拉伸，高缩放屏发糊
$manifest = Join-Path $root 'app.manifest'
if (-not (Test-Path $manifest)) { throw ("缺少清单文件：" + $manifest) }

# 2) 打包界面资源（app/ → web.zip，作为 EXE 的内嵌资源）
Write-Host '== 打包界面资源 =='
$webZip = Join-Path $out 'web.zip'
Compress-Archive -Path (Join-Path $appDir '*') -DestinationPath $webZip -Force

$refNames = @('System.dll', 'System.Core.dll', 'System.Drawing.dll', 'System.Windows.Forms.dll',
              'System.IO.Compression.dll', 'System.IO.Compression.FileSystem.dll',
              'System.Web.Extensions.dll')
$refs = @()
foreach ($n in $refNames) { $refs += ('/r:' + (Join-Path $fx $n)) }
$refs += ('/r:' + (Join-Path $wv2 'lib\Microsoft.Web.WebView2.Core.dll'))
$refs += ('/r:' + (Join-Path $wv2 'lib\Microsoft.Web.WebView2.WinForms.dll'))

# 3) 编译主程序
Write-Host '== 编译 Allegro.exe =='
$appSources = Get-ChildItem (Join-Path $root 'src') -Filter *.cs | ForEach-Object { $_.FullName }
$appArgs = @('/nologo', '/target:winexe', '/platform:x64', '/langversion:7.3', '/optimize+',
             ('/out:' + (Join-Path $out 'Allegro.exe')),
             ('/win32icon:' + $ico),
             ('/win32manifest:' + $manifest),
             ('/resource:' + $webZip + ',web.zip')) + $refs + $appSources
& $roslyn @appArgs
if ($LASTEXITCODE -ne 0) { throw '主程序编译失败' }

# 4) 运行时依赖放到主程序旁边
Copy-Item (Join-Path $wv2 'WebView2Loader.dll') $out -Force
Copy-Item (Join-Path $wv2 'lib\Microsoft.Web.WebView2.Core.dll') $out -Force
Copy-Item (Join-Path $wv2 'lib\Microsoft.Web.WebView2.WinForms.dll') $out -Force
Copy-Item $ico $out -Force
Copy-Item (Join-Path $root 'README.txt') $out -Force

# 5) 便携版
Write-Host '== 生成便携版 =='
$portableDir = Join-Path $dist 'Allegro-portable'
New-Item -ItemType Directory -Force -Path $portableDir | Out-Null
foreach ($f in @('Allegro.exe', 'WebView2Loader.dll', 'Microsoft.Web.WebView2.Core.dll',
                 'Microsoft.Web.WebView2.WinForms.dll', 'abbeyroad.ico', 'README.txt')) {
    Copy-Item (Join-Path $out $f) $portableDir -Force
}
$portableZip = Join-Path $dist "Allegro-v$version-portable.zip"
if (Test-Path $portableZip) { Remove-Item $portableZip -Force }
Compress-Archive -Path (Join-Path $portableDir '*') -DestinationPath $portableZip -Force

# 6) 安装器（把便携版整体作为 app.zip 内嵌）
Write-Host '== 编译安装器 =='
$appZip = Join-Path $out 'app.zip'
if (Test-Path $appZip) { Remove-Item $appZip -Force }
Compress-Archive -Path (Join-Path $portableDir '*') -DestinationPath $appZip -Force

# 注意：PowerShell 里逗号优先级高于 +，数组元素必须逐条 += 并在括号内拼接
$setupRefs = @()
foreach ($n in @('System.dll', 'System.Core.dll', 'System.Drawing.dll', 'System.Windows.Forms.dll',
                 'System.IO.Compression.dll', 'System.IO.Compression.FileSystem.dll')) {
    $setupRefs += ('/r:' + (Join-Path $fx $n))
}
$setupOut = Join-Path $dist "Allegro-Setup-v$version.exe"
$setupArgs = @('/nologo', '/target:winexe', '/platform:x64', '/langversion:7.3', '/optimize+',
               ('/out:' + $setupOut),
               ('/win32icon:' + $ico),
               ('/win32manifest:' + $manifest),
               ('/resource:' + $appZip + ',app.zip')) + $setupRefs +
             @((Join-Path $root 'installer\Installer.cs'))
& $roslyn @setupArgs
if ($LASTEXITCODE -ne 0) { throw '安装器编译失败' }

# 7) 可选：代码签名（有证书环境变量才签，否则跳过）
if ($env:ABBEYROAD_SIGN_PFX -or $env:ABBEYROAD_SIGN_THUMB) {
    Write-Host '== 代码签名 =='
    $signArgs = @('-File', $setupOut, (Join-Path $portableDir 'Allegro.exe'))
    if ($env:ABBEYROAD_SIGN_PFX) { $signArgs += @('-Pfx', $env:ABBEYROAD_SIGN_PFX) }
    if ($env:ABBEYROAD_SIGN_THUMB) { $signArgs += @('-Thumbprint', $env:ABBEYROAD_SIGN_THUMB) }
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'sign-exe.ps1') @signArgs
    if ($LASTEXITCODE -ne 0) { throw '代码签名失败' }
    # 签名会改文件哈希，重新打一次便携包，保证 zip 里是签过的 exe
    if (Test-Path $portableZip) { Remove-Item $portableZip -Force }
    Compress-Archive -Path (Join-Path $portableDir '*') -DestinationPath $portableZip -Force
} else {
    Write-Host '== 跳过代码签名（设置 ABBEYROAD_SIGN_PFX 或 ABBEYROAD_SIGN_THUMB 后自动签）=='
}

Write-Host ''
Write-Host 'DONE：'
Get-ChildItem $dist -File | Where-Object { $_.Name -like '*Allegro*' } |
    Select-Object Name, @{n = 'MB'; e = { [math]::Round($_.Length / 1MB, 2) } } | Format-Table -AutoSize
Write-Host ('便携版目录：' + $portableDir)
