import gql from 'graphql-tag'
import {addNode, createSite, deleteSite, enableModule, publishAndWaitJobEnding} from '@jahia/cypress'

export const siteKey = 'channelstest'
export const DEVICE_FACTORY_PID = 'org.jahia.community.modules.channels.device'

export type Device = {
    name: string
    displayName: string
    userAgent: boolean
    overlayScrollbars: boolean
    variants: {name: string, width: number, height: number, frameWidth: number, frameHeight: number, screenX: number, screenY: number}[]
}

/** The devices shipped with a frame, generated with their configurations by tools/generate-devices.py. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const DEVICES: Device[] = require('../fixtures/devices.json')

/** Preview-only viewports, in the order of the preview selector. */
export const VIEWPORTS = DEVICES.filter(d => !d.userAgent)

/** Devices resolved from the User-Agent header. generic_mobile is the hidden fallback of the two phones. */
export const USER_AGENT_DEVICES = DEVICES.filter(d => d.userAgent)
export const HIDDEN_DEVICES = ['generic_mobile']

export const SHIPPED_DEVICES = [...HIDDEN_DEVICES, ...DEVICES.map(d => d.name)]

export const USER_AGENTS = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
}

export type GqlChannel = {
    name: string
    displayName: string
    isVisible: boolean
    variants: {name: string, displayName: string, imageSize: {width: number | string, height: number | string}}[]
}

const CHANNELS_QUERY = gql`
    query channelsTest {
        jcontent {
            channels {
                name
                displayName
                isVisible
                variants {
                    name
                    displayName
                    imageSize {
                        width
                        height
                    }
                }
            }
        }
    }
`

/** Yields the channels as returned by the query used by the jContent customized preview. */
export const getChannels = (): Cypress.Chainable<GqlChannel[]> =>
    cy.apollo({query: CHANNELS_QUERY, fetchPolicy: 'no-cache'})
        .its('data.jcontent.channels') as unknown as Cypress.Chainable<GqlChannel[]>

export const getChannelNames = (): Cypress.Chainable<string[]> =>
    getChannels().then(channels => channels.map(c => c.name).sort())

/** Retries the channels query until `predicate` holds on the channel names (configuration changes are asynchronous). */
export const waitForChannelNames = (predicate: (names: string[]) => boolean, description: string) => {
    cy.waitUntil(() => getChannelNames().then(names => predicate(names)), {
        errorMsg: `Timed out waiting for: ${description}`,
        timeout: 30000,
        interval: 1000
    })
}

/** Creates or updates the factory configuration <DEVICE_FACTORY_PID>-<configIdentifier>.cfg through the provisioning API. */
export const editDeviceConfiguration = (configIdentifier: string, properties: Record<string, string>) => {
    const lines = Object.keys(properties).map(k => `    ${JSON.stringify(k)}: ${JSON.stringify(properties[k])}`)
    const script = [
        `- editConfiguration: "${DEVICE_FACTORY_PID}"`,
        `  configIdentifier: "${configIdentifier}"`,
        '  properties:',
        ...lines
    ].join('\n')
    cy.runProvisioningScript({script: {fileContent: script, type: 'application/yaml'}})
}

/** Installs a .cfg file into karaf/etc through the provisioning API (installConfiguration). */
export const installDeviceConfigurationFile = (configIdentifier: string, content: string) => {
    const fileName = `${DEVICE_FACTORY_PID}-${configIdentifier}.cfg`
    cy.runProvisioningScript({
        script: [{installConfiguration: fileName}],
        files: [{fileName, fileContent: content, type: 'text/plain'}]
    })
}

/** Deletes the device configuration(s) whose `identifier` property is `identifier`, through the OSGi ConfigurationAdmin. */
export const deleteDeviceConfiguration = (identifier: string) => {
    cy.executeGroovy('groovy/deleteDeviceConfiguration.groovy', {DEVICE_IDENTIFIER: identifier})
}

export const liveHomeUrl = () => `/sites/${siteKey}/home.html`

/** Requests the live home page with the given User-Agent, as an anonymous visitor (no session cookie). */
export const requestLiveHome = (userAgent: string): Cypress.Chainable<string> => {
    cy.clearCookies()
    return cy.request({url: liveHomeUrl(), headers: {'User-Agent': userAgent}})
        .then(resp => {
            expect(resp.status).to.eq(200)
            return resp.body as string
        })
}

// ---------------------------------------------------------------------------------------------------------------
// Helpers shared by the specs 05 and later. Each of these specs creates its own site, so that it does not depend on
// the order in which the specs run, and deletes it at the end.
// ---------------------------------------------------------------------------------------------------------------

export const ANDROID_TABLET_USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** One User-Agent per shipped User-Agent device, plus a desktop one that resolves no device. */
export const UA = {
    iphone: USER_AGENTS.iphone,
    androidPhone: USER_AGENTS.androidPhone,
    ipad: USER_AGENTS.ipad,
    androidTablet: ANDROID_TABLET_USER_AGENT,
    desktop: USER_AGENTS.desktop
}
export type UaName = keyof typeof UA

export type ChannelSelection = {mode: 'include' | 'exclude', channels: string[]}

/** A jnt:text item whose text is `marker`, with the jmix:channelSelection mixin when `selection` is given. */
export const textItem = (name: string, marker: string, selection?: ChannelSelection | 'mixinOnly') => ({
    name,
    primaryNodeType: 'jnt:text',
    mixins: selection ? ['jmix:channelSelection'] : [],
    properties: [
        {name: 'text', value: marker, language: 'en'},
        ...(selection && selection !== 'mixinOnly' ? [
            {name: 'j:channelSelection', values: selection.channels},
            {name: 'j:channelIncludeOrExclude', value: selection.mode}
        ] : [])
    ]
})

/**
 * Creates the site `key` (empty-templates, channels enabled) with the given items in the area of its home page,
 * and publishes it. An existing site with the same key is deleted first.
 */
export const createTestSite = (key: string, items: ReturnType<typeof textItem>[], publish = true) => {
    deleteSite(key)
    createSite(key, {templateSet: 'empty-templates', serverName: 'localhost', locale: 'en'})
    enableModule('channels', key)
    addNode({
        parentPathOrId: `/sites/${key}/home`,
        name: 'pagecontent',
        primaryNodeType: 'jnt:contentList',
        children: items
    })
    if (publish) {
        publishAndWaitJobEnding(`/sites/${key}`, ['en'])
    }
}

/** Basic authentication of the root user, for cy.request to the preview and edit renderings. */
export const rootAuth = () => ({user: 'root', pass: Cypress.env('SUPER_USER_PASSWORD') || 'root1234'})

/** Requests the live home page of `key` anonymously with the given User-Agent. */
export const requestLive = (key: string, userAgent: string): Cypress.Chainable<string> => {
    cy.clearCookies()
    return cy.request({url: `/sites/${key}/home.html`, headers: {'User-Agent': userAgent}})
        .then(resp => {
            expect(resp.status).to.eq(200)
            return resp.body as string
        })
}

/**
 * Requests a rendering of the home page of `key` in the default workspace as root (basic authentication, no session):
 * `render` is the preview, `editframe` the edit mode used by the jContent page builder.
 */
export const requestDefault = (key: string, servlet: 'render' | 'editframe', query = '', userAgent = USER_AGENTS.desktop): Cypress.Chainable<string> => {
    cy.clearCookies()
    return cy.request({
        url: `/cms/${servlet}/default/en/sites/${key}/home.html${query}`,
        auth: rootAuth(),
        headers: {'User-Agent': userAgent}
    }).then(resp => {
        expect(resp.status).to.eq(200)
        return resp.body as string
    })
}

/** Asserts that each marker is present (true) or absent (false) in `body`. */
export const expectMarkers = (body: string, expected: Record<string, boolean>, context: string) => {
    Object.keys(expected).forEach(marker => {
        if (expected[marker]) {
            expect(body, `${context}: ${marker} present`).to.contain(marker)
        } else {
            expect(body, `${context}: ${marker} absent`).not.to.contain(marker)
        }
    })
}

/** Runs a groovy script of fixtures/groovy that returns JSON with setResult, and yields the parsed result. */
export const groovyJson = <T = any>(script: string, replacements: Record<string, string> = {}): Cypress.Chainable<T> =>
    cy.executeGroovy(`groovy/${script}`, replacements).then((result: unknown) => {
        expect(result, `result of ${script}`).to.be.a('string')
        return JSON.parse(result as string) as T
    }) as unknown as Cypress.Chainable<T>

export type ServedChannel = {identifier: string, fallBack: string, visible: boolean, capabilities: Record<string, string>}

/** The channels as served by the core ChannelService (fallBack and capabilities are not exposed by GraphQL). */
export const getServedChannels = (ids: string[]): Cypress.Chainable<{all: string[], channels: Record<string, ServedChannel>}> =>
    groovyJson('getChannels.groovy', {CHANNEL_IDS: ids.join(',')})

/** The lines of jahia.log that contain `token`. */
export const getLogLines = (token: string): Cypress.Chainable<string[]> =>
    groovyJson<{lines: string[]}>('readLog.groovy', {TOKEN: token}).then(r => r.lines)

/** Marks the device configurations created by the tests, so that deleteTestDeviceConfigurations removes them all. */
export const TEST_MARKER = {'cypress.test': 'true'}

/** Deletes every device configuration created by the tests (property cypress.test = true). */
export const deleteTestDeviceConfigurations = () => {
    cy.executeGroovy('groovy/deleteTestDeviceConfigurations.groovy', {})
}

/** A suffix that differs from one run to the next, to find the log lines of this run. */
export const runId = () => `${Date.now().toString(36)}`

/**
 * Waits until the device selector of the customized preview dialog is enabled: jContent disables it while it loads
 * the channels, and a click on it is then ignored.
 */
export const waitForChannelSelectorEnabled = () => {
    cy.get('[data-sel-role="channel-selector-dropdown"]', {timeout: 30000}).should($el => {
        const disabled = $el.is('.moonstone-disabled') || $el.find('.moonstone-disabled').length > 0
        expect(disabled, 'device selector disabled while the channels load').to.eq(false)
    })
}

export const CUSTOMIZED_PREVIEW_IFRAME = 'iframe[data-sel-role="customized-preview-iframe"]'

/** Width taken by a classic scrollbar in the browser running the tests (0 with overlay scrollbars). */
export const measureScrollbarWidth = (doc: Document): number => {
    const outer = doc.createElement('div')
    outer.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll'
    doc.body.appendChild(outer)
    const width = outer.offsetWidth - outer.clientWidth
    outer.remove()
    return width
}

/**
 * Checks the jContent customized preview of a device with a frame (the page generated by ChannelPreviewFrameFilter
 * in the preview iframe of jContent): sizes, no scrollbar around the device, width of the previewed page, overlay
 * scrollbar style, border of the jContent iframe and accessibility attributes.
 * `tallPage`: the previewed page is higher than the screen, so that it has a vertical scrollbar unless it is hidden.
 */
export const expectFramedPreview = (deviceName: string, variantName: string, marker: string, tallPage: boolean) => {
    const device = DEVICES.find(d => d.name === deviceName)
    const variant = device.variants.find(v => v.name === variantName)
    const variantLabel = variantName.charAt(0).toUpperCase() + variantName.slice(1)
    cy.get(CUSTOMIZED_PREVIEW_IFRAME).should('be.visible')
        .and('have.attr', 'width', String(variant.frameWidth + 16))
        .and('have.attr', 'height', String(variant.frameHeight + 16))
    cy.get(CUSTOMIZED_PREVIEW_IFRAME).invoke('attr', 'src')
        .should('include', `channel=${deviceName}`)
        .and('include', `variant=${variantName}`)
    cy.get(CUSTOMIZED_PREVIEW_IFRAME).should($host => {
        const host = $host[0] as HTMLIFrameElement
        const doc = host.contentDocument
        const frame = doc?.querySelector('.channels-frame') as HTMLElement
        expect(frame, 'frame').not.to.eq(null)
        expect(frame.getAttribute('style'), 'frame picture').to.contain(`images/frames/${deviceName}-${variantName}.svg`)
        const screen = doc.querySelector('iframe.channels-screen') as HTMLIFrameElement
        expect(screen, 'screen').not.to.eq(null)
        expect([screen.getAttribute('width'), screen.getAttribute('height')], 'screen size')
            .to.deep.equal([String(variant.width), String(variant.height)])
        expect(screen.contentDocument?.body?.textContent, 'page content').to.contain(marker)

        // c. the border of the jContent iframe is removed by the script of the wrapper
        expect(host.ownerDocument.defaultView.getComputedStyle(host).borderTopWidth, 'border of the jContent iframe').to.eq('0px')
        expect(host.ownerDocument.defaultView.getComputedStyle(host).borderLeftWidth, 'border of the jContent iframe').to.eq('0px')

        // a. no scrollbar around the device: the wrapper fits in the jContent iframe
        const root = doc.documentElement
        expect(root.scrollWidth, 'wrapper scrollWidth <= clientWidth').to.be.at.most(root.clientWidth)
        expect(root.scrollHeight, 'wrapper scrollHeight <= clientHeight').to.be.at.most(root.clientHeight)
        expect(doc.defaultView.innerWidth, 'wrapper innerWidth = clientWidth (no vertical scrollbar)').to.eq(root.clientWidth)
        expect(doc.defaultView.innerHeight, 'wrapper innerHeight = clientHeight (no horizontal scrollbar)').to.eq(root.clientHeight)

        // b. width of the previewed page
        const page = screen.contentDocument.documentElement
        if (tallPage) {
            expect(page.scrollHeight, 'the previewed page is higher than the screen').to.be.greaterThan(page.clientHeight)
        }
        const style = screen.contentDocument.getElementById('channels-overlay-scrollbars')
        if (device.overlayScrollbars) {
            expect(screen.getAttribute('data-overlay-scrollbars'), 'data-overlay-scrollbars').to.eq('true')
            expect(style, 'overlay scrollbar style injected').not.to.eq(null)
            expect(page.clientWidth, 'width of the previewed page = width of the screen').to.eq(variant.width)
        } else {
            expect(screen.hasAttribute('data-overlay-scrollbars'), 'no data-overlay-scrollbars').to.eq(false)
            expect(style, 'no overlay scrollbar style').to.eq(null)
            expect(page.clientWidth, 'width of the previewed page, minus a classic scrollbar if any')
                .to.eq(variant.width - (tallPage ? measureScrollbarWidth(screen.contentDocument) : 0))
        }

        // d. accessibility of the wrapper
        expect(root.getAttribute('lang'), 'lang').to.match(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/)
        expect(doc.querySelectorAll('main'), 'main').to.have.length(1)
        expect(screen.getAttribute('tabindex'), 'tabindex').to.eq('0')
        expect(screen.getAttribute('title'), 'title of the screen').to.contain(device.displayName).and.to.contain(variantLabel)
        expect(doc.activeElement, 'focus not moved by the script').to.eq(doc.body)
    })
}
