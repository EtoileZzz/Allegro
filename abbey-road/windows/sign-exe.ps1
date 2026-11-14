# Allegro · Windows 代码签名
#
# 用法（三种模式，任选其一）：
#
#   A) 用 PFX 证书文件（推荐：买到 OV/EV 证书后导出成 pfx）
#      powershell -ExecutionPolicy Bypass -File windows\sign-exe.ps1 `
#        -Pfx 'C:\certs\etoilezzz-ov.pfx' -PfxPassword '...' `
#        -File 'dist\Allegro-Setup-v0.5.2a.exe'
#      （密码也可以用环境变量 ABBEYROAD_SIGN_PFX_PASS，别写进命令历史）
#
#   B) 用本机证书库里的证书（EV 硬件令牌驱动装好后通常能看到）
#      powershell -File windows\sign-exe.ps1 -Thumbprint 'AB12...' -File '...'
#
#   C) 自签名（免费，只对本机/自己导入过证书的设备有效 —— 适合自己用，不适合公开分发）
#      powershell -File windows\sign-exe.ps1 -SelfSigned -File 'dist\Allegro-Setup-v0.5.2a.exe'
#      第一次用 -SelfSigned 时会生成一张「Allegro 代码签名」证书放进当前用户证书库，
#      想让自己这台机器认它：把证书导入「受信任的根证书颁发机构」
#        certmgr.msc → 受信任的根证书颁发机构 → 所有任务 → 导入 → 选 signExe 打印的 .cer
#
# 不加 -File 时默认签 dist 里的安装器 + 便携版里的 Allegro.exe。
# 每签一次文件哈希都会变，所以签完要重新算 SHA-256 再上传。

param(
    [string]$Pfx = '',
    [string]$PfxPassword = '',
    [string]$Thumbprint = '',
    [switch]$SelfSigned,
    [string[]]$File = @(),
    [string]$TimestampServer = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'
$projRoot = Split-Path $PSScriptRoot -Parent
$dist = Join-Path $projRoot 'dist'

if (-not $File -or $File.Count -eq 0) {
    $v = (Select-String -Path (Join-Path $projRoot 'windows\build.ps1') -Pattern "^\`$version\s*=\s*'([^']+)'" |
        Select-Object -First 1).Matches.Groups[1].Value
    $File = @(
        (Join-Path $dist ("Allegro-Setup-v" + $v + ".exe")),
        (Join-Path $dist 'Allegro-portable\Allegro.exe')
    )
}
$targets = @()
foreach ($f in $File) {
    $p = if (Test-Path $f) { (Resolve-Path $f).Path } else { $null }
    if (-not $p) { Write-Host ("跳过（不存在）：" + $f) -ForegroundColor Yellow } else { $targets += $p }
}
if ($targets.Count -eq 0) { throw '没有可签名的文件' }

# ── 取证书 ────────────────────────────────────────────────────────
$cert = $null
if ($SelfSigned) {
    $subject = 'CN=EtoileZzz, OU=Allegro, O=EtoileZzz, C=CN'
    $cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $subject -and $_.HasPrivateKey } |
        Sort-Object NotAfter -Descending | Select-Object -First 1
    if (-not $cert) {
        Write-Host '生成自签名代码签名证书（10 年）…'
        $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $subject `
            -KeyExportPolicy Exportable -KeyUsage DigitalSignature `
            -CertStoreLocation Cert:\CurrentUser\My `
            -NotAfter (Get-Date).AddYears(10)
        $cer = Join-Path $dist 'Allegro-selfsigned.cer'
        Export-Certificate -Cert $cert -FilePath $cer | Out-Null
        Write-Host ('已导出公钥证书：' + $cer)
        Write-Host '要让这台机器信任它：certmgr.msc → 受信任的根证书颁发机构 → 导入这个 .cer'
    }
    Write-Host ('使用自签名证书：' + $cert.Thumbprint) -ForegroundColor Cyan
}
elseif ($Pfx) {
    if (-not (Test-Path $Pfx)) { throw ('找不到 PFX：' + $Pfx) }
    if (-not $PfxPassword) { $PfxPassword = $env:ABBEYROAD_SIGN_PFX_PASS }
    if (-not $PfxPassword) { throw '缺少 PFX 密码：用 -PfxPassword 或环境变量 ABBEYROAD_SIGN_PFX_PASS' }
    $cert = Get-PfxCertificate -FilePath $Pfx -Password (ConvertTo-SecureString $PfxPassword -AsPlainText -Force)
    Write-Host ('使用 PFX 证书：' + $cert.Subject) -ForegroundColor Cyan
}
elseif ($Thumbprint) {
    $cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Thumbprint -eq $Thumbprint } | Select-Object -First 1
    if (-not $cert) { throw ('证书库里没有指纹 ' + $Thumbprint) }
    Write-Host ('使用证书：' + $cert.Subject) -ForegroundColor Cyan
}
else {
    throw '要指定一种签名方式：-Pfx / -Thumbprint / -SelfSigned'
}

# ── 签名 ─────────────────────────────────────────────────────────
$signtool = (Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter 'signtool.exe' `
    -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like '*x64*' } | Select-Object -First 1)
if ($signtool) {
    Write-Host ('用 signtool：' + $signtool.FullName)
    foreach ($t in $targets) {
        & $signtool.FullName sign /fd SHA256 /td SHA256 /tr $TimestampServer /sha1 $cert.Thumbprint /s My $t
        if ($LASTEXITCODE -ne 0) { throw ('签名失败：' + $t) }
        Write-Host ('  已签：' + (Split-Path $t -Leaf)) -ForegroundColor Green
    }
}
else {
    # 没有 Windows SDK 时用 PowerShell 自带接口（能签，但没有时间戳）
    Write-Host '没找到 signtool，改用 Set-AuthenticodeSignature（无时间戳）' -ForegroundColor Yellow
    foreach ($t in $targets) {
        $r = Set-AuthenticodeSignature -FilePath $t -Certificate $cert -HashAlgorithm SHA256
        if ($r.Status -ne 'Valid') { throw ('签名失败：' + $t + ' → ' + $r.Status) }
        Write-Host ('  已签：' + (Split-Path $t -Leaf)) -ForegroundColor Green
    }
}

Write-Host ''
Write-Host '签名校验：'
foreach ($t in $targets) {
    $s = Get-AuthenticodeSignature $t
    Write-Host ('  ' + (Split-Path $t -Leaf) + '  ' + $s.Status + '  ' + $s.SignerCertificate.Subject)
    $h = (Get-FileHash $t -Algorithm SHA256).Hash.ToLower()
    Write-Host ('    SHA-256 ' + $h)
}
