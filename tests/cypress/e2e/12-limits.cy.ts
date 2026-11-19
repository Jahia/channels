import {deleteSite} from '@jahia/cypress'
import {
    createTestSite,
    deleteTestDeviceConfigurations,
    editDeviceConfiguration,
    expectMarkers,
    getLogLines,
    getServedChannels,
    groovyJson,
    requestDefault,
    requestLive,
    TEST_MARKER,
    textItem,
    UA,
    waitForChannelNames
} from '../support/channels'

// Limits of the module: the variant parameter of the preview has to be a variant of the device
// (ChannelPreviewFrameFilter), the patterns are matched against the first 1024 characters of the User-Agent, and a
// device cannot fall back to itself (ConfiguredChannelProvider).
describe('Channels - limits', () => {
    const site = 'channelslimits'
    const M = {always: 'HARD_ALWAYS', onlyIphone: 'HARD_ONLY_IPHONE', excludedCycleA: 'HARD_EXCLUDED_CYCLE_A'}
    const cycleA = 'cypress_cycle_a'
    const cycleB = 'cypress_cycle_b'
    const UNKNOWN_VARIANT = 'Unknown variant for this device.'

    before(() => {
        cy.login()
        deleteTestDeviceConfigurations()
        createTestSite(site, [
            textItem('always', M.always),
            textItem('only-iphone', M.onlyIphone, {mode: 'include', channels: ['apple_iphone_ver1']}),
            textItem('excluded-cycle-a', M.excludedCycleA, {mode: 'exclude', channels: [cycleA]})
        ])
    })

    after(() => {
        cy.login()
        deleteTestDeviceConfigurations()
        deleteSite(site)
    })

    describe('variant parameter of the preview', () => {
        it('a declared variant gives the device frame', () => {
            requestDefault(site, 'render', '?channel=apple_iphone_ver1&variant=landscape').then(body => {
                expect(body).to.contain('apple_iphone_ver1-landscape.svg')
                expect(body).to.contain('channels-frame')
                expect(body).not.to.contain(UNKNOWN_VARIANT)
            })
        })

        it('a variant that the device does not declare is rejected', () => {
            requestDefault(site, 'render', '?channel=apple_iphone_ver1&variant=bogus').then(body => {
                expect(body).to.contain(UNKNOWN_VARIANT)
                expect(body).not.to.contain('<iframe')
                expect(body).not.to.contain('channels-frame')
                expect(body).not.to.contain(M.always)
                expect(body, 'only the message').not.to.contain('bogus')
            })
        })

        it('the parameter is not checked where the core filter does not use it (noembed=true, device without variants)', () => {
            requestDefault(site, 'render', '?channel=apple_iphone_ver1&variant=bogus&noembed=true').then(body => {
                expect(body).not.to.contain(UNKNOWN_VARIANT)
                expectMarkers(body, {[M.always]: true, [M.onlyIphone]: true}, 'noembed')
            })
            requestDefault(site, 'render', '?channel=generic_mobile&variant=bogus').then(body => {
                expect(body).not.to.contain(UNKNOWN_VARIANT)
                expect(body).to.contain(M.always)
            })
        })
    })

    it('only the first 1024 characters of the User-Agent are matched against the patterns', () => {
        const padding = 'x'.repeat(1100)
        requestLive(site, `Mozilla/5.0 (iPhone; ${padding})`)
            .then(body => expectMarkers(body, {[M.always]: true, [M.onlyIphone]: true}, 'iPhone token at the start'))
        requestLive(site, `Mozilla/5.0 (${padding}; iPhone)`)
            .then(body => expectMarkers(body, {[M.always]: true, [M.onlyIphone]: false}, 'iPhone token after 1024 characters'))
    })

    it('a fallBack cycle is broken: rendering and channel matching terminate, the cycle is logged', () => {
        editDeviceConfiguration('cypress-cycle-a', {
            ...TEST_MARKER,
            identifier: cycleA,
            fallBack: cycleB,
            'capability.userAgentPattern': '.*CypressCycleA.*'
        })
        editDeviceConfiguration('cypress-cycle-b', {
            ...TEST_MARKER,
            identifier: cycleB,
            fallBack: cycleA,
            'capability.userAgentPattern': '.*CypressCycleB.*'
        })
        waitForChannelNames(names => names.includes(cycleA) && names.includes(cycleB), 'cycle devices present')
        cy.waitUntil(() => getServedChannels([cycleA, cycleB]).then(({channels}) =>
            channels[cycleA].fallBack === 'generic' || channels[cycleB].fallBack === 'generic'),
        {errorMsg: 'the cycle was not broken', timeout: 15000, interval: 1000})

        getServedChannels([cycleA, cycleB]).then(({channels}) => {
            const fallBacks = [channels[cycleA].fallBack, channels[cycleB].fallBack].sort()
            // one of them falls back to generic, the other one still to the first one
            expect(fallBacks.filter(f => f === 'generic'), 'falls back to generic').to.have.length(1)
            expect(fallBacks.filter(f => f === cycleA || f === cycleB), 'kept fallBack').to.have.length(1)
        })
        ;[cycleA, cycleB].forEach(current => {
            groovyJson('matchChannel.groovy', {CURRENT: current, SELECTED: 'nothing_matches'}).then(r => {
                expect(r.match).to.eq(false)
                expect(r.chain[r.chain.length - 1], `fallBack chain of ${current}`).to.eq('generic')
            })
        })
        requestLive(site, 'Mozilla/5.0 CypressCycleA')
            .then(body => expectMarkers(body, {[M.always]: true, [M.excludedCycleA]: false}, 'cycle a'))
        requestLive(site, 'Mozilla/5.0 CypressCycleB').then(body => expect(body).to.contain(M.always))
        requestLive(site, UA.desktop)
            .then(body => expectMarkers(body, {[M.always]: true, [M.excludedCycleA]: true}, 'desktop'))
        cy.waitUntil(() => getLogLines('falls back to itself').then(lines => lines.some(l => l.includes(cycleA) || l.includes(cycleB))),
            {errorMsg: 'no log line for the fallBack cycle', timeout: 15000, interval: 1000})
    })
})
