#!/bin/bash
# Stages the module artifact built by `mvn clean install` (../target) into ./artifacts.
# ./artifacts is wiped first, so that a stale jar is never deployed.
cd "$(dirname "$0")" || exit 1
source ./set-env.sh

rm -rf ./artifacts
mkdir -p ./artifacts
find ../target -maxdepth 1 -name "${MODULE_ID}-*-SNAPSHOT.jar" ! -name "*-sources.jar" -exec cp {} ./artifacts/ \;

if ! ls ./artifacts/*.jar > /dev/null 2>&1; then
  echo " == ci.build.sh: no ${MODULE_ID}-*-SNAPSHOT.jar in ../target, build the module first (mvn clean install)"
  exit 1
fi
echo " == ci.build.sh: staged artifacts"
ls -la ./artifacts
