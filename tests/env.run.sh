#!/bin/bash
# Provisions the running Jahia, then runs the Cypress suite headless from the host.
# Extra arguments are passed to Cypress, e.g. ./env.run.sh --spec cypress/e2e/01-api.cy.ts
cd "$(dirname "$0")" || exit 1
source ./set-env.sh

./env.provision.sh || { mkdir -p results; echo failure > results/test_failure; exit 1; }

rm -rf ./results/reports ./results/test_success ./results/test_failure
mkdir -p ./results/reports

NO_COLOR=1 yarn e2e:ci "$@"
status=$?
if [[ $status -eq 0 ]]; then
  echo success > ./results/test_success
else
  echo failure > ./results/test_failure
fi
yarn -s report:merge && yarn -s report:html
exit $status
