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
emulator -avd protobase-test -wipe-data -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -memory 2048 -cores 2 >/dev/null 2>&1 &
trap 'adb emu kill >/dev/null 2>&1 || true' EXIT
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 3; done
adb install -r -t "$here/../build/outputs/apk/androidTest/debug/protobase-mobile-debug-androidTest.apk" >/dev/null
result=$(adb shell am instrument -w -r net.protobase.mobile.test/androidx.test.runner.AndroidJUnitRunner)
if ! echo "$result" | grep '^OK ('; then echo "$result"; exit 1; fi
