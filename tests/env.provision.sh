#!/bin/bash
# Waits for Jahia, runs the provisioning manifest (with the files of ./assets), then installs ./artifacts/*-SNAPSHOT.jar.
# Modeled on @jahia/cypress env.provision.sh.
cd "$(dirname "$0")" || exit 1
source ./set-env.sh

START_TIME=$SECONDS
echo " == env.provision.sh: waiting for Jahia at ${JAHIA_PROCESSING_URL}"
while [[ $(curl -s -o /dev/null -w '%{http_code}' "${JAHIA_PROCESSING_URL}/cms/login") -ne 200 ]]; do
  if [[ $((SECONDS - START_TIME)) -gt 600 ]]; then
    echo " == Jahia failed to start after 600 seconds"
    exit 1
  fi
  sleep 5
done
echo " == Jahia is up after $((SECONDS - START_TIME)) seconds"

mkdir -p ./run-artifacts ./results
cp "${MANIFEST}" ./run-artifacts/

files=()
for f in assets/*; do
  [[ -f "$f" ]] && files+=(--form "file=@$f")
done
echo " == Executing manifest ${MANIFEST}"
curl -sf -u "root:${SUPER_USER_PASSWORD}" -X POST "${JAHIA_PROCESSING_URL}/modules/api/provisioning" \
  --form "script=@./run-artifacts/${MANIFEST};type=text/yaml" "${files[@]}" || { echo " == PROVISIONING FAILURE"; exit 1; }
echo

if [[ -d artifacts ]]; then
  for f in artifacts/*-SNAPSHOT.jar; do
    [[ -f "$f" ]] || continue
    name=$(basename "$f")
    echo " == Installing ${name}"
    curl -sf -u "root:${SUPER_USER_PASSWORD}" -X POST "${JAHIA_PROCESSING_URL}/modules/api/provisioning" \
      --form "script=[{\"installOrUpgradeBundle\":\"${name}\",\"forceUpdate\":true}]" --form "file=@$f" \
      || { echo " == INSTALL FAILURE for ${name}"; exit 1; }
    echo
  done
fi
