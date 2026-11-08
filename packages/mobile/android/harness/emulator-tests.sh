#!/bin/sh
# Builds the guard's tests with this harness and runs them on a headless emulator: the JVM tests, then the instrumented
# ones. Needs ANDROID_HOME with platforms;android-36, build-tools, platform-tools, emulator and
# system-images;android-36;google_apis;x86_64, KVM, and Gradle 8.14 as `gradle`. Usage:
#   emulator-tests.sh <@capacitor/android folder> <@capawesome/capacitor-live-update folder>
set -eu
here=$(cd "$(dirname "$0")" && pwd)
gradle -q --no-daemon -p "$here" -PcapacitorAndroid="$1" -PliveUpdate="$2" :protobase-mobile:testDebugUnitTest :protobase-mobile:assembleDebugAndroidTest
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
[ -d "${ANDROID_AVD_HOME:-$HOME/.android/avd}/protobase-test.avd" ] || echo no | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd -n protobase-test -k "system-images;android-36;google_apis;x86_64" -d pixel_6 >/dev/null
log=$(mktemp)
emulator -avd protobase-test -wipe-data -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -memory 2048 -cores 2 >"$log" 2>&1 &
trap 'adb emu kill >/dev/null 2>&1 || true' EXIT
# Each wait is bounded; one that runs out shows the emulator's own output and the device's log.
fail() {
  echo "$1"
  tail -n 100 "$log"
  timeout 30 adb logcat -d -t 300 2>/dev/null || true
  exit 1
}
timeout 120 adb wait-for-device || fail "No emulator came up in 2 minutes"
deadline=$(($(date +%s) + 600))
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
  [ "$(date +%s)" -lt "$deadline" ] || fail "The emulator did not finish booting in 10 minutes"
  sleep 3
done
timeout 120 adb install -r -t "$here/../build/outputs/apk/androidTest/debug/protobase-mobile-debug-androidTest.apk" >/dev/null || fail "The test app did not install"
result=$(timeout 900 adb shell am instrument -w -r net.protobase.mobile.test/androidx.test.runner.AndroidJUnitRunner) || fail "The tests did not run to the end: $result"
if ! echo "$result" | grep '^OK ('; then echo "$result"; exit 1; fi
