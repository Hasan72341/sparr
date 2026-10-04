#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The native helper currently supports macOS only." >&2
  exit 1
fi
mkdir -p native/macos/.build
sparr_os_major="$(sw_vers -productVersion | cut -d. -f1)"
sparr_sdk="${SPARR_MACOS_SDK:-$(xcrun --show-sdk-path)}"
# Prefer the SDK for the running OS when a newer SDK does not match the installed compiler.
if [[ -z "${SPARR_MACOS_SDK:-}" && -d "/Library/Developer/CommandLineTools/SDKs/MacOSX${sparr_os_major}.sdk" ]]; then
  sparr_sdk="/Library/Developer/CommandLineTools/SDKs/MacOSX${sparr_os_major}.sdk"
fi
swiftc -sdk "$sparr_sdk" -O -framework AppKit -framework AVFoundation -framework CoreGraphics native/macos/Inspector.swift -o native/macos/.build/sparr-inspect
codesign --force --sign - native/macos/.build/sparr-inspect
sparr_guardian_app='native/macos/.build/Sparr Guardian.app'
mkdir -p "$sparr_guardian_app/Contents/MacOS"
cp native/macos/Guardian-Info.plist "$sparr_guardian_app/Contents/Info.plist"
swiftc -sdk "$sparr_sdk" -target "$(uname -m)-apple-macos14.0" -O \
  -framework AppKit -framework AVFoundation -framework CoreGraphics \
  -framework IOKit -framework Security -framework Vision \
  native/macos/Guardian.swift -o "$sparr_guardian_app/Contents/MacOS/sparr-guardian"
codesign --force --sign - "$sparr_guardian_app"
codesign --verify --strict "$sparr_guardian_app"
"$sparr_guardian_app/Contents/MacOS/sparr-guardian" --self-test
printf 'Built observation helper and Sparr Guardian app.\nThis is an ad-hoc local build, not a notarized release.\n'
