import {defineConfig} from 'cypress'

export default defineConfig({
    reporter: 'cypress-multi-reporters',
    reporterOptions: {
        configFile: 'reporter-config.json'
    },
    screenshotsFolder: './results/screenshots',
    video: true,
    videosFolder: './results/videos',
    viewportWidth: 1366,
    viewportHeight: 768,
    defaultCommandTimeout: 15000,
    watchForFileChanges: false,
    e2e: {
        setupNodeEvents(on, config) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require('./cypress/plugins/index.js')(on, config)
        },
        excludeSpecPattern: '*.ignore.ts',
        // overridden by JAHIA_URL (see harness.env) in cypress/plugins/index.js
        baseUrl: 'http://localhost:8090'
    },
    env: {}
})
