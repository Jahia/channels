#!/bin/bash
# Opens the interactive Cypress runner against the running Jahia (run ./env.run.sh or ./env.provision.sh once first).
cd "$(dirname "$0")" || exit 1
source ./set-env.sh
yarn e2e:debug
