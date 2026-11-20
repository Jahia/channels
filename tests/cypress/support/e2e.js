// eslint-disable-next-line @typescript-eslint/no-var-requires
require('cypress-terminal-report/src/installLogsCollector')()
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('@jahia/cypress/dist/support/registerSupport').registerSupport()

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('cypress-wait-until')

Cypress.on('uncaught:exception', () => false)
