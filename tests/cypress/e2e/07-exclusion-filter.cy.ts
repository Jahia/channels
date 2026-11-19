import {deleteSite} from '@jahia/cypress'
import {createTestSite, expectMarkers, requestDefault, requestLive, textItem, UA, UaName} from '../support/channels'

// The jmix:channelSelection render filter (ChannelExclusionFilter): several channels in a selection, a selection
// without channels, and its behaviour in preview (?channel=) and in edit mode (unselectedChannel wrapper).
describe('Channels - exclusion filter', () => {
    const site = 'channelsfilter'
    const M = {
        always: 'FLT_ALWAYS',
        excludedIphoneIpad: 'FLT_EXCLUDED_IPHONE_IPAD',
        onlyIphoneAndroid: 'FLT_ONLY_IPHONE_ANDROID_PHONE',
        mixinOnly: 'FLT_MIXIN_WITHOUT_SELECTION',
        excludedIphone: 'FLT_EXCLUDED_IPHONE',
        onlyIphone: 'FLT_ONLY_IPHONE',
        onlyViewport: 'FLT_ONLY_VIEWPORT_0360',
        excludedViewport: 'FLT_EXCLUDED_VIEWPORT_0360'
    }

    before(() => {
        cy.login()
        createTestSite(site, [
            textItem('always', M.always),
            textItem('excluded-iphone-ipad', M.excludedIphoneIpad, {mode: 'exclude', channels: ['apple_iphone_ver1', 'apple_ipad_ver1']}),
            textItem('only-iphone-android', M.onlyIphoneAndroid, {mode: 'include', channels: ['apple_iphone_ver1', 'generic_android']}),
            textItem('mixin-only', M.mixinOnly, 'mixinOnly'),
            textItem('excluded-iphone', M.excludedIphone, {mode: 'exclude', channels: ['apple_iphone_ver1']}),
            textItem('only-iphone', M.onlyIphone, {mode: 'include', channels: ['apple_iphone_ver1']}),
            textItem('only-viewport', M.onlyViewport, {mode: 'include', channels: ['viewport_0360']}),
            textItem('excluded-viewport', M.excludedViewport, {mode: 'exclude', channels: ['viewport_0360']})
        ])
    })

    after(() => {
        cy.login()
        deleteSite(site)
    })

    describe('several channels in a selection (live)', () => {
        const expected: Record<UaName, Record<string, boolean>> = {
            iphone: {[M.excludedIphoneIpad]: false, [M.onlyIphoneAndroid]: true},
            ipad: {[M.excludedIphoneIpad]: false, [M.onlyIphoneAndroid]: false},
            androidPhone: {[M.excludedIphoneIpad]: true, [M.onlyIphoneAndroid]: true},
            androidTablet: {[M.excludedIphoneIpad]: true, [M.onlyIphoneAndroid]: false},
            desktop: {[M.excludedIphoneIpad]: true, [M.onlyIphoneAndroid]: false}
        }
        ;(Object.keys(expected) as UaName[]).forEach(ua => {
            it(`${ua}: exclude [iPhone, iPad] -> ${expected[ua][M.excludedIphoneIpad] ? 'shown' : 'hidden'}, include [iPhone, Android phone] -> ${expected[ua][M.onlyIphoneAndroid] ? 'shown' : 'hidden'}`, () => {
                requestLive(site, UA[ua]).then(body => expectMarkers(body, {[M.always]: true, ...expected[ua]}, ua))
            })
        })
    })

    it('jmix:channelSelection without j:channelSelection: the content is rendered for every channel', () => {
        ;(Object.keys(UA) as UaName[]).forEach(ua => {
            requestLive(site, UA[ua]).then(body => expectMarkers(body, {[M.always]: true, [M.mixinOnly]: true}, ua))
        })
        requestDefault(site, 'render', '?channel=apple_iphone_ver1&noembed=true')
            .then(body => expectMarkers(body, {[M.mixinOnly]: true}, 'preview iPhone'))
    })

    describe('preview with ?channel= (logged in, noembed=true for the page itself)', () => {
        it('without channel: the rules of the generic channel apply', () => {
            requestDefault(site, 'render').then(body => expectMarkers(body, {
                [M.always]: true,
                [M.excludedIphone]: true,
                [M.onlyIphone]: false,
                [M.onlyViewport]: false,
                [M.excludedViewport]: true
            }, 'preview generic'))
        })

        it('channel=apple_iphone_ver1: the rules apply as for an iPhone, whatever the User-Agent', () => {
            requestDefault(site, 'render', '?channel=apple_iphone_ver1&noembed=true').then(body => expectMarkers(body, {
                [M.always]: true,
                [M.excludedIphone]: false,
                [M.onlyIphone]: true,
                [M.excludedIphoneIpad]: false,
                [M.onlyIphoneAndroid]: true
            }, 'preview iPhone'))
        })

        it('channel=viewport_0360: the rules of the viewport apply', () => {
            requestDefault(site, 'render', '?channel=viewport_0360&noembed=true').then(body => expectMarkers(body, {
                [M.always]: true,
                [M.onlyViewport]: true,
                [M.excludedViewport]: false,
                [M.onlyIphone]: false,
                [M.excludedIphone]: true
            }, 'preview viewport_0360'))
        })

        it('the channel parameter is ignored in live', () => {
            cy.clearCookies()
            cy.request({url: `/sites/${site}/home.html?channel=apple_iphone_ver1`, headers: {'User-Agent': UA.desktop}})
                .its('body')
                .then(body => expectMarkers(body, {[M.always]: true, [M.onlyIphone]: false, [M.excludedIphone]: true}, 'live ?channel='))
        })
    })

    describe('edit mode (the /cms/editframe rendering used by the jContent page builder)', () => {
        const wrapped = (body: string, marker: string) => new RegExp(
            `<div class="unselectedChannelContainer">\\s*<div class="unselectedChannelContent">\\s*${marker}\\s*</div>\\s*` +
            '<div class="unselectedChannelOverlay">\\s*Unselected from this channel\\s*</div>').test(body)

        it('generic channel: a content item excluded for the current channel stays, wrapped by the unselectedChannel view', () => {
            requestDefault(site, 'editframe').then(body => {
                // include [iPhone] does not match generic: wrapped
                expect(wrapped(body, M.onlyIphone), `${M.onlyIphone} wrapped`).to.eq(true)
                expect(wrapped(body, M.onlyViewport), `${M.onlyViewport} wrapped`).to.eq(true)
                // exclude [iPhone] does not apply to generic: rendered, not wrapped
                expect(body).to.contain(M.excludedIphone)
                expect(wrapped(body, M.excludedIphone), `${M.excludedIphone} not wrapped`).to.eq(false)
                expect(wrapped(body, M.always), `${M.always} not wrapped`).to.eq(false)
            })
        })

        it('another channel previewed in edit mode (?channel=apple_iphone_ver1): excluded content is removed, not wrapped', () => {
            requestDefault(site, 'editframe', '?channel=apple_iphone_ver1').then(body => {
                expectMarkers(body, {[M.always]: true, [M.onlyIphone]: true, [M.excludedIphone]: false, [M.onlyViewport]: false}, 'edit iPhone')
                expect(body, 'no wrapper').not.to.contain('unselectedChannelContainer')
            })
        })

        it('in the jContent page builder, the excluded item shows the "Unselected from this channel" overlay', () => {
            cy.loginAndStoreSession()
            cy.visit(`/jahia/jcontent/${site}/en/pages/home`)
            cy.get('iframe[data-sel-role="page-builder-frame-active"]', {timeout: 60000}).should($iframe => {
                const doc = ($iframe[0] as HTMLIFrameElement).contentDocument
                expect(doc?.body?.textContent, 'page content').to.contain(M.always)
                const overlays = Cypress.$(doc).find('.unselectedChannelContainer')
                const texts = overlays.toArray().map(o => o.textContent.replace(/\s+/g, ' ').trim())
                expect(texts, 'wrapped items').to.include(`${M.onlyIphone} Unselected from this channel`)
                expect(texts.join(' '), 'not wrapped').not.to.contain(M.excludedIphone)
            })
        })
    })
})
