#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../ios"
if ! command -v xcodegen >/dev/null 2>&1; then
  echo 'Install XcodeGen 2.46.0, then rerun this script.' >&2
  exit 1
fi
if [[ "$(xcodegen --version)" != *"2.46.0"* ]]; then
  echo 'This project pins XcodeGen 2.46.0 for repeatable generation.' >&2
  exit 1
fi
xcodegen generate --spec project.yml
xcodebuild -project SundayDesk.xcodeproj -scheme SundayDesk \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath DerivedData CODE_SIGNING_ALLOWED=NO build-for-testing
