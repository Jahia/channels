import {deleteSite} from '@jahia/cypress'
import {
    createTestSite,
    deleteTestDeviceConfigurations,
    editDeviceConfiguration,
    expectMarkers,
    requestDefault,
    requestLive,
    TEST_MARKER,
    textItem,
    UA,
    UaName,
    waitForChannelNames
} from '../support/channels'

// Live resolution of the channel from the User-Agent header, proven by content items that are only rendered for one
// channel (jmix:channelSelection, include mode) or excluded for one channel (exclude mode).
describe('Channels - device resolution in live', () => {
    const site = 'channelsresolution'
    const M = {
        always: 'RES_ALWAYS',
        iphone: 'RES_ONLY_IPHONE',
        androidPhone: 'RES_ONLY_ANDROID_PHONE',
        ipad: 'RES_ONLY_IPAD',
        androidTablet: 'RES_ONLY_ANDROID_TABLET',
        notGenericMobile: 'RES_EXCLUDED_GENERIC_MOBILE',
        viewport: 'RES_ONLY_VIEWPORT_0360',
        runtime: 'RES_ONLY_RUNTIME_DEVICE',
        orderA: 'RES_ONLY_ORDER_A',
        orderB: 'RES_ONLY_ORDER_B'
    }
    const runtimeDevice = 'cypress_runtime_ua'
    const runtimeUserAgent = 'Mozilla/5.0 (X11; Linux x86_64) CypressRuntimeDevice/1.0'
    const orderA = 'cypress_order_a'
    const orderB = 'cypress_order_b'
    const orderUserAgent = 'Mozilla/5.0 (X11; Linux x86_64) CypressOrderDevice/1.0'

    before(() => {
        cy.login()
        deleteTestDeviceConfigurations()
        createTestSite(site, [
            textItem('always', M.always),
            textItem('only-iphone', M.iphone, {mode: 'include', channels: ['apple_iphone_ver1']}),
            textItem('only-android-phone', M.androidPhone, {mode: 'include', channels: ['generic_android']}),
            textItem('only-ipad', M.ipad, {mode: 'include', channels: ['apple_ipad_ver1']}),
            textItem('only-android-tablet', M.androidTablet, {mode: 'include', channels: ['android_tablet']}),
            textItem('excluded-generic-mobile', M.notGenericMobile, {mode: 'exclude', channels: ['generic_mobile']}),
            textItem('only-viewport', M.viewport, {mode: 'include', channels: ['viewport_0360']}),
            textItem('only-runtime', M.runtime, {mode: 'include', channels: [runtimeDevice]}),
            textItem('only-order-a', M.orderA, {mode: 'include', channels: [orderA]}),
            textItem('only-order-b', M.orderB, {mode: 'include', channels: [orderB]})
        ])
    })

    after(() => {
        cy.login()
        deleteTestDeviceConfigurations()
        deleteSite(site)
    })

    const deviceMarkers = ['iphone', 'androidPhone', 'ipad', 'androidTablet']

    // what each User-Agent must render: its own device item only, and the generic_mobile exclusion for the two phones
    const expectedFor = (ua: UaName) => ({
        [M.always]: true,
        ...Object.fromEntries(deviceMarkers.map(d => [M[d], d === ua])),
        [M.notGenericMobile]: ua !== 'iphone' && ua !== 'androidPhone',
        [M.viewport]: false
    })

    // A1 + A2 + A10, one test per User-Agent
    ;(Object.keys(UA) as UaName[]).forEach(ua => {
        it(`${ua} User-Agent: resolves ${ua === 'desktop' ? 'no device' : 'its own device'}, generic_mobile fallback ${['iphone', 'androidPhone'].includes(ua) ? 'applies' : 'does not apply'}, viewport never resolved`, () => {
            requestLive(site, UA[ua]).then(body => expectMarkers(body, expectedFor(ua), ua))
        })
    })

    it('a viewport item is rendered when that viewport is previewed (presence counterpart of the live absence)', () => {
        requestDefault(site, 'render', '?channel=viewport_0360&noembed=true')
            .then(body => expectMarkers(body, {[M.always]: true, [M.viewport]: true}, 'preview viewport_0360'))
        requestDefault(site, 'render')
            .then(body => expectMarkers(body, {[M.always]: true, [M.viewport]: false}, 'preview without channel'))
    })

    it('a device added at runtime with a userAgentPattern is resolved in live, and no longer once its configuration is deleted', () => {
        requestLive(site, runtimeUserAgent).then(body => expectMarkers(body, {[M.always]: true, [M.runtime]: false}, 'before'))

        editDeviceConfiguration('cypress-runtime-ua', {
            ...TEST_MARKER,
            identifier: runtimeDevice,
            'capability.display-name': 'Cypress runtime UA device',
            'capability.userAgentPattern': '.*CypressRuntimeDevice.*'
        })
        waitForChannelNames(names => names.includes(runtimeDevice), `${runtimeDevice} present`)
        requestLive(site, runtimeUserAgent).then(body => expectMarkers(body, {[M.always]: true, [M.runtime]: true}, 'configured'))
        // the shipped devices still resolve
        requestLive(site, UA.iphone).then(body => expectMarkers(body, {[M.iphone]: true, [M.runtime]: false}, 'iPhone'))

        deleteTestDeviceConfigurations()
        waitForChannelNames(names => !names.includes(runtimeDevice), `${runtimeDevice} removed`)
        requestLive(site, runtimeUserAgent).then(body => expectMarkers(body, {[M.always]: true, [M.runtime]: false}, 'deleted'))
    })

    it('when two devices match the same User-Agent, the one whose identifier comes first alphabetically wins', () => {
        // created with predictable PIDs that sort the other way round (...device~aa-... holds b, ...device~zz-...
        // holds a), b first, so that neither the configuration PID nor the creation order decides
        const props = (identifier: string) => JSON.stringify({
            ...TEST_MARKER,
            identifier,
            'capability.display-name': identifier,
            'capability.userAgentPattern': '.*CypressOrderDevice.*'
        })
        cy.executeGroovy('groovy/createNamedDeviceConfiguration.groovy', {CONFIG_NAME: 'aa-cypress-order', PROPERTIES_JSON: props(orderB)})
            .should('eq', 'org.jahia.community.modules.channels.device~aa-cypress-order')
        cy.executeGroovy('groovy/createNamedDeviceConfiguration.groovy', {CONFIG_NAME: 'zz-cypress-order', PROPERTIES_JSON: props(orderA)})
            .should('eq', 'org.jahia.community.modules.channels.device~zz-cypress-order')
        waitForChannelNames(names => names.includes(orderA) && names.includes(orderB), 'both order devices present')

        requestLive(site, orderUserAgent)
            .then(body => expectMarkers(body, {[M.always]: true, [M.orderA]: true, [M.orderB]: false}, 'both devices'))

        // without a, b matches
        cy.executeGroovy('groovy/deleteDeviceConfiguration.groovy', {DEVICE_IDENTIFIER: orderA})
        waitForChannelNames(names => !names.includes(orderA) && names.includes(orderB), `${orderA} removed`)
        requestLive(site, orderUserAgent)
            .then(body => expectMarkers(body, {[M.always]: true, [M.orderA]: false, [M.orderB]: true}, 'b alone'))

        deleteTestDeviceConfigurations()
        waitForChannelNames(names => !names.includes(orderB), `${orderB} removed`)
    })
})
