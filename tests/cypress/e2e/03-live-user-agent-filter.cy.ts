import {addNode, createSite, deleteSite, enableModule, publishAndWaitJobEnding} from '@jahia/cypress'
import {requestLiveHome, siteKey, USER_AGENTS} from '../support/channels'

// Live rendering: the channel is resolved from the User-Agent header, and the jmix:channelSelection render filter
// removes the content items excluded for (or not included in) that channel.
// Requests are anonymous, and each User-Agent is requested twice (and interleaved) so that the HTML cache,
// whose key contains the channel, is exercised as well.
describe('Channels - User-Agent resolution and channel exclusion filter in live', () => {
    const ALWAYS = 'CHANNELS_MARKER_ALWAYS'
    const EXCLUDED_ON_IPHONE = 'CHANNELS_MARKER_EXCLUDED_ON_IPHONE'
    const ONLY_ON_IPHONE = 'CHANNELS_MARKER_ONLY_ON_IPHONE'

    const text = (name: string, value: string, channelSelection?: {mode: string, channels: string[]}) => ({
        name,
        primaryNodeType: 'jnt:text',
        mixins: channelSelection ? ['jmix:channelSelection'] : [],
        properties: [
            {name: 'text', value, language: 'en'},
            ...(channelSelection ? [
                {name: 'j:channelSelection', values: channelSelection.channels},
                {name: 'j:channelIncludeOrExclude', value: channelSelection.mode}
            ] : [])
        ]
    })

    before(() => {
        cy.login()
        deleteSite(siteKey)
        createSite(siteKey, {templateSet: 'empty-templates', serverName: 'localhost', locale: 'en'})
        enableModule('channels', siteKey)
        addNode({
            parentPathOrId: `/sites/${siteKey}/home`,
            name: 'pagecontent',
            primaryNodeType: 'jnt:contentList',
            children: [
                text('always', ALWAYS),
                text('excluded-on-iphone', EXCLUDED_ON_IPHONE, {mode: 'exclude', channels: ['apple_iphone_ver1']}),
                text('only-on-iphone', ONLY_ON_IPHONE, {mode: 'include', channels: ['apple_iphone_ver1']})
            ]
        })
        publishAndWaitJobEnding(`/sites/${siteKey}`, ['en'])
        cy.logout()
    })

    const expectPage = (userAgent: string, expected: {[marker: string]: boolean}) => {
        requestLiveHome(userAgent).then(body => {
            Object.keys(expected).forEach(marker => {
                if (expected[marker]) {
                    expect(body, `${marker} present`).to.contain(marker)
                } else {
                    expect(body, `${marker} absent`).not.to.contain(marker)
                }
            })
        })
    }

    const desktop = {[ALWAYS]: true, [EXCLUDED_ON_IPHONE]: true, [ONLY_ON_IPHONE]: false}
    const iphone = {[ALWAYS]: true, [EXCLUDED_ON_IPHONE]: false, [ONLY_ON_IPHONE]: true}

    it('desktop User-Agent: excluded-on-iPhone content present, iPhone-only content absent', () => {
        expectPage(USER_AGENTS.desktop, desktop)
    })

    it('iPhone User-Agent: excluded-on-iPhone content absent, iPhone-only content present', () => {
        expectPage(USER_AGENTS.iphone, iphone)
    })

    it('iPad User-Agent (another device) renders like desktop for these rules', () => {
        expectPage(USER_AGENTS.ipad, desktop)
    })

    it('Android phone User-Agent (another device) renders like desktop for these rules', () => {
        expectPage(USER_AGENTS.androidPhone, desktop)
    })

    it('second round, served from the HTML cache, keeps the result per channel', () => {
        expectPage(USER_AGENTS.iphone, iphone)
        expectPage(USER_AGENTS.desktop, desktop)
        expectPage(USER_AGENTS.iphone, iphone)
        expectPage(USER_AGENTS.desktop, desktop)
    })
})
