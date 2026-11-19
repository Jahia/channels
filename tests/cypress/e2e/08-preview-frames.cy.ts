import {deleteSite} from '@jahia/cypress'
import {
    createTestSite,
    deleteTestDeviceConfigurations,
    DEVICES,
    editDeviceConfiguration,
    getLogLines,
    getServedChannels,
    requestDefault,
    ServedChannel,
    TEST_MARKER,
    textItem,
    waitForChannelNames
} from '../support/channels'

// The device frame of the preview (/cms/render, ?channel=&variant=), drawn by the module (ChannelPreviewFrameFilter)
// in place of the core ChannelPreviewFilter, for every shipped device and variant. The expected geometry is read
// from the configuration served by ChannelService, compared with devices.json, and cross-checked against the frame
// picture: the screen of the picture must be exactly where the page is placed.
describe('Channels - device frames of the preview', () => {
    const site = 'channelsframes'
    const MARKER = 'FRAMES_PAGE_CONTENT'
    const served: Record<string, ServedChannel> = {}

    before(() => {
        cy.login()
        deleteTestDeviceConfigurations()
        createTestSite(site, [textItem('always', MARKER)], false)
        getServedChannels(DEVICES.map(d => d.name)).then(r => Object.assign(served, r.channels))
    })

    after(() => {
        cy.login()
        deleteTestDeviceConfigurations()
        deleteSite(site)
    })

    const pair = (value: string) => value.split('x').map(Number)
    const parse = (body: string) => new DOMParser().parseFromString(body, 'text/html')

    DEVICES.forEach(device => device.variants.forEach((variant, index) => {
        it(`${device.name} ${variant.name}: frame ${variant.frameWidth}x${variant.frameHeight}, screen ${variant.width}x${variant.height} at ${variant.screenX}x${variant.screenY}`, () => {
            const caps = served[device.name].capabilities
            const [x, y] = pair(caps['decorator-screen-positions'].split(',')[index])
            const image = caps['decorator-images'].split(',')[index]
            expect(caps.variants.split(',')[index], 'variant of the configuration').to.eq(variant.name)
            expect(pair(caps['usable-resolutions'].split(',')[index]), 'screen of the configuration').to.deep.equal([variant.width, variant.height])
            expect(pair(caps['decorator-image-sizes'].split(',')[index]), 'frame of the configuration').to.deep.equal([variant.frameWidth, variant.frameHeight])
            expect([x, y], 'screen position of the configuration').to.deep.equal([variant.screenX, variant.screenY])
            expect(caps['overlay-scrollbars'] === 'true', 'overlay-scrollbars of the configuration').to.eq(device.overlayScrollbars)
            expect(image).to.eq(`/modules/channels/images/frames/${device.name}-${variant.name}.svg`)

            requestDefault(site, 'render', `?channel=${device.name}&variant=${variant.name}`).then(body => {
                expect(body.trim().toLowerCase(), 'an HTML document').to.match(/^<!doctype html>/)
                const doc = parse(body)
                const frame = doc.querySelector('main > div.channels-frame') as HTMLElement
                expect(frame, 'frame').not.to.eq(null)
                expect(frame.style.width, 'frame width').to.eq(`${variant.frameWidth}px`)
                expect(frame.style.height, 'frame height').to.eq(`${variant.frameHeight}px`)
                expect(frame.getAttribute('style'), 'frame picture').to.contain(`background-image:url('${image}')`)
                const screens = doc.querySelectorAll('iframe')
                expect(screens, 'one screen').to.have.length(1)
                const screen = screens[0] as HTMLIFrameElement
                expect(screen.classList.contains('channels-screen'), 'class of the screen').to.eq(true)
                expect(screen.parentElement, 'screen inside the frame').to.eq(frame)
                expect(screen.style.left, 'left = decorator-screen-positions x').to.eq(`${x}px`)
                expect(screen.style.top, 'top = decorator-screen-positions y').to.eq(`${y}px`)
                expect([screen.getAttribute('width'), screen.getAttribute('height')], 'screen size').to.deep.equal([String(variant.width), String(variant.height)])
                expect(screen.getAttribute('data-overlay-scrollbars'), 'data-overlay-scrollbars').to.eq(device.overlayScrollbars ? 'true' : null)
                const src = new URL(screen.getAttribute('src'), Cypress.config().baseUrl)
                expect(src.pathname).to.eq(`/cms/render/default/en/sites/${site}/home.html`)
                expect(src.searchParams.get('channel')).to.eq(device.name)
                expect(src.searchParams.get('variant')).to.eq(variant.name)
                expect(src.searchParams.get('noembed')).to.eq('true')
                expect(body, 'the wrapper does not hold the page').not.to.contain(MARKER)

                // the page in the nested iframe is the page itself
                requestDefault(site, 'render', src.search).then(page => {
                    expect(page).to.contain(MARKER)
                    expect(page).not.to.contain('channels-frame')
                })
            })

            // the white screen of the picture is exactly at x, y and has the size of the screen
            cy.request(image).its('body').then((svg: string) => {
                const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
                const screens = Array.from(doc.querySelectorAll('rect')).filter(r => r.getAttribute('fill') === '#ffffff')
                expect(screens, 'one screen in the picture').to.have.length(1)
                const rect = screens[0]
                expect(['x', 'y', 'width', 'height'].map(a => Number(rect.getAttribute(a))), 'screen in the picture')
                    .to.deep.equal([x, y, variant.width, variant.height])
                expect([svg.match(/width="(\d+)"/)[1], svg.match(/height="(\d+)"/)[1]].map(Number), 'size of the picture')
                    .to.deep.equal([variant.frameWidth, variant.frameHeight])
            })
        })
    }))

    it('the wrapper is accessible: lang, main, a titled screen reachable with the keyboard', () => {
        requestDefault(site, 'render', '?channel=apple_iphone_ver1&variant=landscape').then(body => {
            const doc = parse(body)
            expect(doc.documentElement.getAttribute('lang'), 'lang').to.eq('en')
            expect(doc.querySelectorAll('main'), 'one main').to.have.length(1)
            const screen = doc.querySelector('iframe')
            expect(screen.getAttribute('tabindex'), 'tabindex').to.eq('0')
            // label.channels.preview.screen = Preview of the page: {0} ({1})
            expect(screen.getAttribute('title'), 'title of the screen').to.eq('Preview of the page: Phone: iPhone (Landscape)')
            // label.channels.preview.title; Jahia prefixes the title of the document
            expect(doc.title, 'title of the document').to.contain('Device preview: Phone: iPhone (Landscape)')
        })
    })

    it('the style sheet and the script are linked with a cache-busting version, and served', () => {
        requestDefault(site, 'render', '?channel=viewport_0360&variant=portrait').then(body => {
            const doc = parse(body)
            const css = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map(l => l.getAttribute('href'))
                .filter(h => h.includes('/modules/channels/'))
            const js = Array.from(doc.querySelectorAll('script[src]')).map(l => l.getAttribute('src'))
                .filter(h => h.includes('/modules/channels/'))
            expect(css, 'style sheet').to.have.length(1)
            expect(js, 'script').to.have.length(1)
            expect(css[0]).to.match(/^\/modules\/channels\/css\/preview-frame\.css\?v=\d+$/)
            expect(js[0]).to.match(/^\/modules\/channels\/javascript\/preview-frame\.js\?v=\d+$/)
            expect(css[0].split('?v=')[1], 'same version').to.eq(js[0].split('?v=')[1])
            cy.request(css[0]).then(r => {
                expect(r.status).to.eq(200)
                expect(r.body).to.contain('.channels-screen')
            })
            cy.request(js[0]).then(r => {
                expect(r.status).to.eq(200)
                expect(r.body).to.contain('channels-overlay-scrollbars')
            })
        })
    })

    it('the other request parameters are kept, encoded, in the address of the screen', () => {
        const value = 'a&b=c d é'
        const name = 'p x'
        const query = `?channel=apple_iphone_ver1&variant=portrait&foo=${encodeURIComponent(value)}&${encodeURIComponent(name)}=1`
        requestDefault(site, 'render', query).then(body => {
            const src = new URL(parse(body).querySelector('iframe').getAttribute('src'), Cypress.config().baseUrl)
            expect(src.searchParams.get('foo'), 'value kept').to.eq(value)
            expect(src.searchParams.get(name), 'name kept').to.eq('1')
            expect(src.searchParams.getAll('channel'), 'channel once').to.deep.equal(['apple_iphone_ver1'])
            expect(src.searchParams.getAll('variant'), 'variant once').to.deep.equal(['portrait'])
            expect(src.searchParams.getAll('noembed')).to.deep.equal(['true'])
            expect(src.search, 'value encoded').to.contain('foo=a%26b%3Dc+d+%C3%A9')
            expect(body, 'ampersands of the address escaped in the page').to.contain('&amp;channel=apple_iphone_ver1')
        })
    })

    it('without variant, the first variant is used', () => {
        const device = DEVICES.find(d => d.name === 'apple_iphone_ver1')
        const first = device.variants[0]
        requestDefault(site, 'render', `?channel=${device.name}`).then(body => {
            const doc = parse(body)
            expect(doc.querySelector('.channels-frame').getAttribute('style')).to.contain(`${device.name}-${first.name}.svg`)
            const screen = doc.querySelector('iframe')
            expect([screen.getAttribute('width'), screen.getAttribute('height')]).to.deep.equal([String(first.width), String(first.height)])
            expect(new URL(screen.getAttribute('src'), Cypress.config().baseUrl).searchParams.get('variant')).to.eq(first.name)
        })
    })

    it('a frame whose configuration is malformed is not drawn: an error message is shown and logged', () => {
        const INVALID = 'The frame of this device is not configured correctly.'
        const frame = {
            'capability.variants': 'portrait,landscape',
            'capability.variants-displayNames': 'Portrait,Landscape',
            'capability.usable-resolutions': '390x844,844x390',
            'capability.decorator-images': '/modules/channels/images/frames/apple_iphone_ver1-portrait.svg,/modules/channels/images/frames/apple_iphone_ver1-landscape.svg',
            'capability.decorator-image-sizes': '418x924,924x418',
            'capability.decorator-screen-positions': '14x40,40x14'
        }
        const cases = {
            cypress_bad_size: {'capability.decorator-image-sizes': 'widexhigh,924x418'},
            cypress_missing_value: {'capability.usable-resolutions': '390x844'},
            cypress_bad_picture: {'capability.decorator-images': '/pictures/my frame.svg,/modules/channels/images/frames/apple_iphone_ver1-landscape.svg'}
        }
        const variantOf = {cypress_bad_size: 'portrait', cypress_missing_value: 'landscape', cypress_bad_picture: 'portrait'}
        Object.keys(cases).forEach(id => {
            editDeviceConfiguration(id.replace(/_/g, '-'), {...TEST_MARKER, identifier: id, 'capability.display-name': id, ...frame, ...cases[id]})
        })
        waitForChannelNames(names => Object.keys(cases).every(id => names.includes(id)), 'malformed devices present')
        Object.keys(cases).forEach(id => {
            requestDefault(site, 'render', `?channel=${id}&variant=${variantOf[id]}`).then(body => {
                expect(body, id).to.contain(INVALID)
                expect(body, `${id}: no frame`).not.to.contain('channels-frame')
                expect(body, `${id}: no page`).not.to.contain(MARKER)
                expect(body, `${id}: no picture`).not.to.contain('my frame.svg')
            })
            cy.waitUntil(() => getLogLines(`The frame of the channel ${id} is not configured correctly`).then(lines => lines.length > 0),
                {errorMsg: `no log line for ${id}`, timeout: 15000, interval: 1000})
        })
        // the valid variant of the device with a missing value is drawn
        requestDefault(site, 'render', '?channel=cypress_missing_value&variant=portrait').then(body => {
            expect(body).to.contain('channels-frame')
            expect(body).not.to.contain(INVALID)
        })
    })

    it('a device without frame (only variants and decorator-image-sizes as in README, or an incomplete frame) is previewed without wrapper', () => {
        const frameless = 'cypress_frameless_1440'
        editDeviceConfiguration('cypress-frameless-1440', {
            ...TEST_MARKER,
            identifier: frameless,
            'capability.display-name': 'Desktop 1440',
            'capability.variants': 'landscape',
            'capability.variants-displayNames': 'Landscape',
            'capability.decorator-image-sizes': '1440x900'
        })
        waitForChannelNames(names => names.includes(frameless), `${frameless} present`)
        requestDefault(site, 'render', `?channel=${frameless}&variant=landscape`).then(body => {
            expect(body).to.contain(MARKER)
            expect(body).not.to.contain('channels-frame')
            expect(body).not.to.contain('<iframe')
        })
        // four of the five keys are not enough for a frame (README: "together")
        const partial = 'cypress_partial_frame'
        editDeviceConfiguration('cypress-partial-frame', {
            ...TEST_MARKER,
            identifier: partial,
            'capability.display-name': 'Partial frame',
            'capability.variants': 'portrait',
            'capability.usable-resolutions': '390x844',
            'capability.decorator-images': '/modules/channels/images/frames/apple_iphone_ver1-portrait.svg',
            'capability.decorator-image-sizes': '418x924'
        })
        waitForChannelNames(names => names.includes(partial), `${partial} present`)
        requestDefault(site, 'render', `?channel=${partial}&variant=portrait`).then(body => {
            expect(body).to.contain(MARKER)
            expect(body).not.to.contain('channels-frame')
        })
        // a framed device, as a counterpart
        requestDefault(site, 'render', '?channel=viewport_1920&variant=landscape').then(body => {
            expect(body).to.contain('channels-frame')
            expect(body).not.to.contain(MARKER)
        })
    })
})
