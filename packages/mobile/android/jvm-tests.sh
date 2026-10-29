#!/bin/sh
# Runs the live updater guard's JVM tests (src/testLiveupdate) on a plain JDK 21, without Android or Gradle: the checks
# they cover use no Android API beyond the Context stub in src/testLiveupdate/jvm. Usage: jvm-tests.sh <jars folder>,
# where the JUnit and org.json jars are kept between runs.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
jars=$1
mkdir -p "$jars"
fetch() {
  [ -f "$jars/$2" ] || curl -fsSL -o "$jars/$2" "https://repo1.maven.org/maven2/$1/$2"
}
fetch junit/junit/4.13.2 junit-4.13.2.jar
fetch org/hamcrest/hamcrest-core/1.3 hamcrest-core-1.3.jar
fetch org/json/json/20250517 json-20250517.jar
classpath="$jars/junit-4.13.2.jar:$jars/hamcrest-core-1.3.jar:$jars/json-20250517.jar"
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
guard="$here/src/liveupdate/java/net/protobase/mobile"
javac -d "$out" -cp "$classpath" \
  "$here/src/main/java/net/protobase/mobile/BundlesFolder.java" \
  "$here/src/testLiveupdate/jvm/android/content/Context.java" \
  $(ls "$guard"/*.java | grep -v GuardedLiveUpdate.java) \
  "$here"/src/testLiveupdate/java/net/protobase/mobile/*.java
tests=$(cd "$here/src/testLiveupdate/java" && ls net/protobase/mobile/*Test.java | sed 's/\.java$//; s#/#.#g')
java -cp "$out:$classpath" org.junit.runner.JUnitCore $tests
