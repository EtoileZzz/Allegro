#!/usr/bin/env bash
set -euo pipefail

# Allegro macOS Universal (x86_64 + arm64) build & DMG packaging script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_SRC="$REPO_ROOT/abbey-road/app"
DIST_DIR="$REPO_ROOT/abbey-road/dist"
BUILD_TMP="$SCRIPT_DIR/build_tmp"
DMG_STAGING="$BUILD_TMP/dmg_staging"
APP_BUNDLE="$BUILD_TMP/Allegro.app"

CORE_JS="$APP_SRC/js/core.js"
INFO_PLIST="$SCRIPT_DIR/Info.plist"

VERSION=$(sed -n "s/.*APP_VERSION = '\([^']*\)'.*/\1/p" "$CORE_JS" | head -n 1)
PLIST_VER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$INFO_PLIST")
if [ -z "$VERSION" ]; then
  echo "ERROR: Cannot read APP_VERSION from $CORE_JS" >&2
  exit 1
fi
if [ "$VERSION" != "$PLIST_VER" ]; then
  echo "ERROR: Version mismatch: core.js=$VERSION, Info.plist=$PLIST_VER" >&2
  exit 1
fi

CLANG="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang"
LIPO="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/lipo"
SDK_PATH="/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk"

if [ ! -x "$CLANG" ]; then CLANG="$(command -v clang)"; fi
if [ ! -x "$LIPO" ]; then LIPO="$(command -v lipo)"; fi

echo "== Building Allegro v$VERSION macOS Universal =="
rm -rf "$BUILD_TMP"
mkdir -p "$BUILD_TMP" "$DIST_DIR"

COMMON_CFLAGS=(-fobjc-arc -O2 -Wall -Wextra -Wno-unused-parameter -isysroot "$SDK_PATH")
COMMON_LDFLAGS=(-isysroot "$SDK_PATH" -framework Cocoa -framework WebKit -framework QuartzCore -framework UserNotifications)

echo "== Compiling x86_64 =="
"$CLANG" -target x86_64-apple-macos10.15 "${COMMON_CFLAGS[@]}" -c "$SCRIPT_DIR/src/AppDelegate.m" -o "$BUILD_TMP/AppDelegate_x86.o"
"$CLANG" -target x86_64-apple-macos10.15 "${COMMON_CFLAGS[@]}" -c "$SCRIPT_DIR/src/main.m" -o "$BUILD_TMP/main_x86.o"
"$CLANG" -target x86_64-apple-macos10.15 "${COMMON_LDFLAGS[@]}" \
  "$BUILD_TMP/AppDelegate_x86.o" "$BUILD_TMP/main_x86.o" -o "$BUILD_TMP/Allegro_x86"

echo "== Compiling arm64 =="
"$CLANG" -target arm64-apple-macos11.0 "${COMMON_CFLAGS[@]}" -c "$SCRIPT_DIR/src/AppDelegate.m" -o "$BUILD_TMP/AppDelegate_arm64.o"
"$CLANG" -target arm64-apple-macos11.0 "${COMMON_CFLAGS[@]}" -c "$SCRIPT_DIR/src/main.m" -o "$BUILD_TMP/main_arm64.o"
"$CLANG" -target arm64-apple-macos11.0 "${COMMON_LDFLAGS[@]}" \
  "$BUILD_TMP/AppDelegate_arm64.o" "$BUILD_TMP/main_arm64.o" -o "$BUILD_TMP/Allegro_arm64"

echo "== Creating Universal Binary =="
"$LIPO" -create -output "$BUILD_TMP/Allegro_universal" "$BUILD_TMP/Allegro_x86" "$BUILD_TMP/Allegro_arm64"
"$LIPO" -info "$BUILD_TMP/Allegro_universal"

echo "== Assembling Allegro.app =="
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources/app"
cp "$BUILD_TMP/Allegro_universal" "$APP_BUNDLE/Contents/MacOS/Allegro"
chmod +x "$APP_BUNDLE/Contents/MacOS/Allegro"

# Copy shared web UI excluding .DS_Store
rsync -a --exclude='.DS_Store' "$APP_SRC/" "$APP_BUNDLE/Contents/Resources/app/"
cp "$SCRIPT_DIR/assets/AppIcon.icns" "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
cp "$INFO_PLIST" "$APP_BUNDLE/Contents/Info.plist"

# Strip AppleDouble / quarantine metadata before signing
xattr -cr "$APP_BUNDLE" 2>/dev/null || true

echo "== Ad-hoc codesign =="
codesign --force --deep --sign - "$APP_BUNDLE"
codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"

echo "== Creating DMG =="
DMG_OUT="$DIST_DIR/Allegro-v$VERSION-mac-universal.dmg"
rm -rf "$DMG_STAGING" "$DMG_OUT"
mkdir -p "$DMG_STAGING"
cp -R "$APP_BUNDLE" "$DMG_STAGING/Allegro.app"
ln -s /Applications "$DMG_STAGING/Applications"

hdiutil create -volname "Allegro v$VERSION" -srcfolder "$DMG_STAGING" -ov -format UDZO "$DMG_OUT"

echo "== DONE -> $DMG_OUT =="
ls -lh "$DMG_OUT"
