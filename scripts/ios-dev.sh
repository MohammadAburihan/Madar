#!/bin/sh
# Builds and runs the iOS app on a simulator using Xcode, without changing the system-wide xcode-select.
# `cap run ios` can't be used: its native-run dependency expects Simulator.app, which Xcode 27 replaced with DeviceHub.
set -eu

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
cd "$(dirname "$0")/../ios/App"

udid="${1:-$(xcrun simctl list devices available | grep -m1 -E 'iPhone.*\(Booted\)' | grep -oE '[0-9A-F-]{36}' || true)}"
udid="${udid:-$(xcrun simctl list devices available | grep -m1 'iPhone' | grep -oE '[0-9A-F-]{36}')}"

xcodebuild -project App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator \
  -destination "id=$udid" -derivedDataPath build/DerivedData -quiet build

xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b >/dev/null
xcrun simctl install "$udid" build/DerivedData/Build/Products/Debug-iphonesimulator/App.app
open "$DEVELOPER_DIR/../Applications/DeviceHub.app" 2>/dev/null || open -a Simulator 2>/dev/null || true
xcrun simctl launch "$udid" app.madar.mobile
