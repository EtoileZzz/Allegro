#!/usr/bin/env bash
set -euo pipefail

# Allegro Android APK build script on macOS (mirrors android/build.ps1)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJ_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PROJ_ROOT/.." && pwd)"
APP_DIR="$PROJ_ROOT/app"
DIST_DIR="$PROJ_ROOT/dist"

if [ -z "${JAVA_HOME:-}" ] && [ -d "$HOME/.allegro-toolchain/jdk17/Contents/Home" ]; then
  export JAVA_HOME="$HOME/.allegro-toolchain/jdk17/Contents/Home"
fi
if [ -z "${ANDROID_SDK_ROOT:-}" ] && [ -d "$HOME/.allegro-toolchain/android-sdk" ]; then
  export ANDROID_SDK_ROOT="$HOME/.allegro-toolchain/android-sdk"
fi

NODE_BIN="${NODE_BIN:-}"
if [ -z "$NODE_BIN" ]; then
  if [ -x "$HOME/.allegro-toolchain/node/bin/node" ]; then
    NODE_BIN="$HOME/.allegro-toolchain/node/bin/node"
  elif command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  fi
fi

PLATFORM="$ANDROID_SDK_ROOT/platforms/android-34/android.jar"
BT="$ANDROID_SDK_ROOT/build-tools/34.0.0"

for p in "$JAVA_HOME/bin/javac" "$JAVA_HOME/bin/jar" "$JAVA_HOME/bin/java" "$PLATFORM" "$BT/aapt2" "$BT/d8" "$BT/zipalign" "$BT/apksigner"; do
  if [ ! -e "$p" ]; then
    echo "ERROR: Missing Android build dependency: $p" >&2
    exit 1
  fi
done

MANIFEST="$SCRIPT_DIR/AndroidManifest.xml"
PS1="$SCRIPT_DIR/build.ps1"

VERSION_PS1=$(sed -n "s/^\$version[[:space:]]*=[[:space:]]*'\([^']*\)'.*/\1/p" "$PS1" | head -n 1)
CODE_PS1=$(sed -n "s/^\$versionCode[[:space:]]*=[[:space:]]*\([0-9]*\).*/\1/p" "$PS1" | head -n 1)
VERSION_MAN=$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' "$MANIFEST" | head -n 1)
CODE_MAN=$(sed -n 's/.*android:versionCode="\([0-9]*\)".*/\1/p' "$MANIFEST" | head -n 1)

if [ -z "$VERSION_PS1" ] || [ "$VERSION_PS1" != "$VERSION_MAN" ] || [ "$CODE_PS1" != "$CODE_MAN" ]; then
  echo "ERROR: Version mismatch: build.ps1=($VERSION_PS1,$CODE_PS1), AndroidManifest.xml=($VERSION_MAN,$CODE_MAN)" >&2
  exit 1
fi

VERSION="$VERSION_PS1"
VERSION_CODE="$CODE_PS1"

# Load keystore path/alias/password safely without echoing secrets
KS_PATH="${ABBEYROAD_KS:-}"
KS_PASS="${ABBEYROAD_KS_PASS:-}"
KS_ALIAS="${ABBEYROAD_KS_ALIAS:-}"

LOCAL_CFG="$SCRIPT_DIR/build.local.ps1"
if [ -f "$LOCAL_CFG" ] && [ -n "$NODE_BIN" ]; then
  eval "$("$NODE_BIN" -e '
    const fs = require("fs");
    const txt = fs.readFileSync(process.argv[1], "utf8");
    const get = (name) => {
      const m = new RegExp("^\\s*\\$" + name + "\\s*=\\s*[\x27\"]([^\x27\"]*)[\x27\"]", "m").exec(txt);
      return m ? m[1] : "";
    };
    const ks = get("ks") || get("ksFile");
    const alias = get("ksAlias");
    const pass = get("ksPass");
    const esc = (s) => "'"'"'" + String(s).replace(/'"'"'/g, "'"'"'\"'"'"'\"'"'"'") + "'"'"'";
    if (ks) process.stdout.write("CFG_KS=" + esc(ks) + "\n");
    if (alias) process.stdout.write("CFG_ALIAS=" + esc(alias) + "\n");
    if (pass) process.stdout.write("CFG_PASS=" + esc(pass) + "\n");
  ' "$LOCAL_CFG")"
  if [ -z "$KS_PATH" ] && [ -n "${CFG_KS:-}" ]; then KS_PATH="$CFG_KS"; fi
  if [ -z "$KS_ALIAS" ] && [ -n "${CFG_ALIAS:-}" ]; then KS_ALIAS="$CFG_ALIAS"; fi
  if [ -z "$KS_PASS" ] && [ -n "${CFG_PASS:-}" ]; then KS_PASS="$CFG_PASS"; fi
fi

if [ -n "$KS_PATH" ] && [ ! -f "$KS_PATH" ]; then
  BASE_KS="$(basename "${KS_PATH//\\//}")"
  if [ -f "$REPO_ROOT/_build/$BASE_KS" ]; then
    KS_PATH="$REPO_ROOT/_build/$BASE_KS"
  fi
fi
if [ -z "$KS_PATH" ] && [ -f "$REPO_ROOT/_build/allegro.keystore" ]; then
  KS_PATH="$REPO_ROOT/_build/allegro.keystore"
fi

if [ -z "$KS_PATH" ] || [ ! -f "$KS_PATH" ]; then
  echo "ERROR: Signing keystore not found ($KS_PATH). Never auto-generate a key." >&2
  exit 1
fi
if [ -z "$KS_PASS" ]; then
  echo "ERROR: Missing keystore password (set ABBEYROAD_KS_PASS or build.local.ps1)." >&2
  exit 1
fi

OUT="$SCRIPT_DIR/build"
GEN="$OUT/gen"
OBJ="$OUT/obj"
DEX_DIR="$OUT/dex"
TOOL_OUT="$OUT/tools"
ASSETS="$SCRIPT_DIR/assets/web"

rm -rf "$OUT" "$SCRIPT_DIR/assets"
mkdir -p "$OUT" "$GEN" "$OBJ" "$DEX_DIR" "$TOOL_OUT" "$DIST_DIR" "$ASSETS"

echo "== Syncing web assets (excluding .DS_Store) =="
rsync -a --exclude='.DS_Store' "$APP_DIR/" "$ASSETS/"
echo "== assets synced: $(find "$ASSETS" -type f | wc -l | tr -d ' ') files =="

echo "== aapt2 compile =="
"$BT/aapt2" compile --dir "$SCRIPT_DIR/res" -o "$OUT/res.zip"

echo "== aapt2 link =="
"$BT/aapt2" link -o "$OUT/base.apk" -I "$PLATFORM" --manifest "$MANIFEST" \
  --java "$GEN" --min-sdk-version 26 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION" "$OUT/res.zip"

echo "== javac =="
JAVA_FILES=()
while IFS= read -r -d '' f; do
  JAVA_FILES+=("$f")
done < <(find "$SCRIPT_DIR/src" "$GEN" -name '*.java' -print0)

"$JAVA_HOME/bin/javac" -encoding UTF-8 -source 1.8 -target 1.8 -bootclasspath "$PLATFORM" \
  -classpath "$GEN" -d "$OBJ" "${JAVA_FILES[@]}"

echo "== d8 =="
CLASSES_JAR="$OUT/classes.jar"
"$JAVA_HOME/bin/jar" cf "$CLASSES_JAR" -C "$OBJ" .
"$BT/d8" --release --lib "$PLATFORM" --min-api 26 --output "$DEX_DIR" "$CLASSES_JAR"

echo "== repackage (ApkBuilder) =="
"$JAVA_HOME/bin/javac" -encoding UTF-8 -d "$TOOL_OUT" "$SCRIPT_DIR/tools/ApkBuilder.java"
"$JAVA_HOME/bin/java" -cp "$TOOL_OUT" ApkBuilder "$OUT/base.apk" "$OUT/rebuilt.apk" "$DEX_DIR/classes.dex" "$SCRIPT_DIR/assets"

echo "== zipalign =="
"$BT/zipalign" -f 4 "$OUT/rebuilt.apk" "$OUT/aligned.apk"

echo "== sign =="
APK_OUT="$DIST_DIR/Allegro-v$VERSION.apk"
SIGN_ARGS=(sign --ks "$KS_PATH" --ks-pass env:ALLEGRO_KS_PASS --key-pass env:ALLEGRO_KS_PASS)
if [ -n "$KS_ALIAS" ]; then
  SIGN_ARGS+=(--ks-key-alias "$KS_ALIAS")
fi
SIGN_ARGS+=(--out "$APK_OUT" "$OUT/aligned.apk")

ALLEGRO_KS_PASS="$KS_PASS" PATH="$JAVA_HOME/bin:$PATH" "$BT/apksigner" "${SIGN_ARGS[@]}"
unset KS_PASS CFG_PASS

echo "== verify signature =="
PATH="$JAVA_HOME/bin:$PATH" "$BT/apksigner" verify --print-certs "$APK_OUT"

echo "DONE -> $APK_OUT"
ls -lh "$APK_OUT"
