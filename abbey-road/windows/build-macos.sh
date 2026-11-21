#!/usr/bin/env bash
set -euo pipefail

# Allegro Windows x64 build script on macOS (via .NET SDK targeting net48)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJ_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$PROJ_ROOT/app"
DIST_DIR="$PROJ_ROOT/dist"
OUT_DIR="$SCRIPT_DIR/build"
ASSETS_DIR="$SCRIPT_DIR/assets"

DOTNET_BIN="${DOTNET_BIN:-}"
if [ -z "$DOTNET_BIN" ]; then
  if [ -x "$HOME/.allegro-toolchain/dotnet/dotnet" ]; then
    DOTNET_BIN="$HOME/.allegro-toolchain/dotnet/dotnet"
  elif command -v dotnet >/dev/null 2>&1; then
    DOTNET_BIN="$(command -v dotnet)"
  fi
fi
if [ -z "$DOTNET_BIN" ] || [ ! -x "$DOTNET_BIN" ]; then
  echo "ERROR: dotnet SDK not found. Set DOTNET_BIN or install to ~/.allegro-toolchain/dotnet" >&2
  exit 1
fi

VER_PS1=$(sed -n "s/^\$version[[:space:]]*=[[:space:]]*'\([^']*\)'.*/\1/p" "$SCRIPT_DIR/build.ps1" | head -n 1)
VER_AP=$(sed -n 's/.*FallbackVersion = "\([^"]*\)".*/\1/p' "$SCRIPT_DIR/src/AppPaths.cs" | head -n 1)
VER_INST=$(sed -n 's/.*internal const string Version = "\([^"]*\)".*/\1/p' "$SCRIPT_DIR/installer/Installer.cs" | head -n 1)

if [ -z "$VER_PS1" ] || [ "$VER_PS1" != "$VER_AP" ] || [ "$VER_PS1" != "$VER_INST" ]; then
  echo "ERROR: Version mismatch: build.ps1=$VER_PS1, AppPaths.cs=$VER_AP, Installer.cs=$VER_INST" >&2
  exit 1
fi
VERSION="$VER_PS1"

ICO="$ASSETS_DIR/abbeyroad.ico"
MANIFEST="$SCRIPT_DIR/app.manifest"
if [ ! -f "$ICO" ] || [ ! -f "$MANIFEST" ]; then
  echo "ERROR: Missing icon ($ICO) or manifest ($MANIFEST)" >&2
  exit 1
fi

# Preserve the 3 WebView2 DLLs before cleaning build/
WV2_CACHE=$(mktemp -d "${TMPDIR:-/tmp}/allegro-wv2-XXXXXX")
STAGE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/allegro-winbuild-XXXXXX")
cleanup() {
  rm -rf "$WV2_CACHE" "$STAGE_DIR"
}
trap cleanup EXIT

DLLS=("WebView2Loader.dll" "Microsoft.Web.WebView2.Core.dll" "Microsoft.Web.WebView2.WinForms.dll")
for dll in "${DLLS[@]}"; do
  if [ -f "$OUT_DIR/$dll" ]; then
    cp "$OUT_DIR/$dll" "$WV2_CACHE/$dll"
  elif [ -f "$DIST_DIR/Allegro-portable/$dll" ]; then
    cp "$DIST_DIR/Allegro-portable/$dll" "$WV2_CACHE/$dll"
  else
    echo "ERROR: Missing WebView2 runtime file: $dll (checked $OUT_DIR and $DIST_DIR/Allegro-portable)" >&2
    exit 1
  fi
done

echo "== Cleaning build dir and restoring WebView2 DLLs =="
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR" "$DIST_DIR"
for dll in "${DLLS[@]}"; do
  cp "$WV2_CACHE/$dll" "$OUT_DIR/$dll"
done
cp "$ICO" "$OUT_DIR/abbeyroad.ico"
cp "$SCRIPT_DIR/README.txt" "$OUT_DIR/README.txt"

echo "== Packaging web.zip (excluding .DS_Store) =="
WEB_ZIP="$OUT_DIR/web.zip"
(cd "$APP_DIR" && find . -type f ! -name '.DS_Store' | sed 's|^\./||' | sort | zip -q -@ "$WEB_ZIP")

echo "== Compiling Allegro.exe (net48 x64) =="
APP_PROJ="$STAGE_DIR/app/Allegro.csproj"
mkdir -p "$STAGE_DIR/app" "$STAGE_DIR/app_out"
cat > "$APP_PROJ" <<EOF
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net48</TargetFramework>
    <PlatformTarget>x64</PlatformTarget>
    <AssemblyName>Allegro</AssemblyName>
    <RootNamespace>Allegro</RootNamespace>
    <LangVersion>7.3</LangVersion>
    <Optimize>true</Optimize>
    <DebugType>none</DebugType>
    <DebugSymbols>false</DebugSymbols>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <GenerateAssemblyInfo>false</GenerateAssemblyInfo>
    <AppendTargetFrameworkToOutputPath>false</AppendTargetFrameworkToOutputPath>
    <AppendRuntimeIdentifierToOutputPath>false</AppendRuntimeIdentifierToOutputPath>
    <CopyLocalLockFileAssemblies>false</CopyLocalLockFileAssemblies>
    <ApplicationIcon>$ICO</ApplicationIcon>
    <ApplicationManifest>$MANIFEST</ApplicationManifest>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NETFramework.ReferenceAssemblies.net48" Version="1.0.3" PrivateAssets="All" />
    <Reference Include="System.Drawing" />
    <Reference Include="System.Windows.Forms" />
    <Reference Include="System.IO.Compression" />
    <Reference Include="System.IO.Compression.FileSystem" />
    <Reference Include="System.Web.Extensions" />
    <Reference Include="Microsoft.Web.WebView2.Core">
      <HintPath>$WV2_CACHE/Microsoft.Web.WebView2.Core.dll</HintPath>
      <Private>false</Private>
    </Reference>
    <Reference Include="Microsoft.Web.WebView2.WinForms">
      <HintPath>$WV2_CACHE/Microsoft.Web.WebView2.WinForms.dll</HintPath>
      <Private>false</Private>
    </Reference>
  </ItemGroup>
  <ItemGroup>
    <Compile Include="$SCRIPT_DIR/src/*.cs" />
    <EmbeddedResource Include="$WEB_ZIP" LogicalName="web.zip" />
  </ItemGroup>
</Project>
EOF

"$DOTNET_BIN" build "$APP_PROJ" -c Release -o "$STAGE_DIR/app_out" --nologo
cp "$STAGE_DIR/app_out/Allegro.exe" "$OUT_DIR/Allegro.exe"

echo "== Creating portable folder & zip =="
PORTABLE_DIR="$DIST_DIR/Allegro-portable"
rm -rf "$PORTABLE_DIR"
mkdir -p "$PORTABLE_DIR"
for f in Allegro.exe WebView2Loader.dll Microsoft.Web.WebView2.Core.dll Microsoft.Web.WebView2.WinForms.dll abbeyroad.ico README.txt; do
  cp "$OUT_DIR/$f" "$PORTABLE_DIR/$f"
done

PORTABLE_ZIP="$DIST_DIR/Allegro-v$VERSION-portable.zip"
rm -f "$PORTABLE_ZIP"
(cd "$PORTABLE_DIR" && find . -maxdepth 1 -type f ! -name '.DS_Store' | sed 's|^\./||' | sort | zip -q -@ "$PORTABLE_ZIP")

echo "== Compiling Allegro-Setup-v$VERSION.exe =="
APP_ZIP="$OUT_DIR/app.zip"
rm -f "$APP_ZIP"
cp "$PORTABLE_ZIP" "$APP_ZIP"

SETUP_PROJ="$STAGE_DIR/setup/AllegroSetup.csproj"
mkdir -p "$STAGE_DIR/setup" "$STAGE_DIR/setup_out"
cat > "$SETUP_PROJ" <<EOF
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net48</TargetFramework>
    <PlatformTarget>x64</PlatformTarget>
    <AssemblyName>Allegro-Setup-v$VERSION</AssemblyName>
    <RootNamespace>AllegroSetup</RootNamespace>
    <LangVersion>7.3</LangVersion>
    <Optimize>true</Optimize>
    <DebugType>none</DebugType>
    <DebugSymbols>false</DebugSymbols>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <GenerateAssemblyInfo>false</GenerateAssemblyInfo>
    <AppendTargetFrameworkToOutputPath>false</AppendTargetFrameworkToOutputPath>
    <AppendRuntimeIdentifierToOutputPath>false</AppendRuntimeIdentifierToOutputPath>
    <CopyLocalLockFileAssemblies>false</CopyLocalLockFileAssemblies>
    <ApplicationIcon>$ICO</ApplicationIcon>
    <ApplicationManifest>$MANIFEST</ApplicationManifest>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NETFramework.ReferenceAssemblies.net48" Version="1.0.3" PrivateAssets="All" />
    <Reference Include="System.Drawing" />
    <Reference Include="System.Windows.Forms" />
    <Reference Include="System.IO.Compression" />
    <Reference Include="System.IO.Compression.FileSystem" />
  </ItemGroup>
  <ItemGroup>
    <Compile Include="$SCRIPT_DIR/installer/Installer.cs" />
    <EmbeddedResource Include="$APP_ZIP" LogicalName="app.zip" />
  </ItemGroup>
</Project>
EOF

"$DOTNET_BIN" build "$SETUP_PROJ" -c Release -o "$STAGE_DIR/setup_out" --nologo
SETUP_OUT="$DIST_DIR/Allegro-Setup-v$VERSION.exe"
cp "$STAGE_DIR/setup_out/Allegro-Setup-v$VERSION.exe" "$SETUP_OUT"

# Optional Authenticode signing hook (unsigned by default per v0.5.6 decision)
if [ -n "${ABBEYROAD_SIGN_PFX:-}" ] && command -v osslsigncode >/dev/null 2>&1; then
  echo "== Optional code signing via osslsigncode =="
  # Reserved for future PFX signing when provided
  :
else
  echo "== Skipping Windows Authenticode signing (unsigned per spec) =="
fi

echo "== DONE Windows build =="
ls -lh "$PORTABLE_ZIP" "$SETUP_OUT"
