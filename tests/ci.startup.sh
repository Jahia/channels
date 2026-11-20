#!/bin/bash
# Starts Jahia in Docker, then provisions it and runs the suite (unless called with `notests`).
# The license is read from JAHIA_LICENSE (base64) or from /tmp/license.xml. It is never printed.
cd "$(dirname "$0")" || exit 1
source ./set-env.sh

echo " == ci.startup.sh"
echo " JAHIA_IMAGE: ${JAHIA_IMAGE}"
echo " JAHIA_URL: ${JAHIA_URL}"
echo " MANIFEST: ${MANIFEST}"
echo " MODULE_ID: ${MODULE_ID}"

if [[ -z "${JAHIA_LICENSE}" ]]; then
  if [[ -f /tmp/license.xml ]]; then
    echo " == License found in /tmp/license.xml, encoding it"
    export JAHIA_LICENSE=$(base64 -i /tmp/license.xml)
  else
    echo " == STARTUP FAILURE: no JAHIA_LICENSE env var and no /tmp/license.xml"
    exit 1
  fi
fi

echo " == Starting Jahia"
docker-compose up -d --renew-anon-volumes jahia || exit 1

if [[ "$1" != "notests" ]]; then
  ./env.run.sh
fi
