import {DEVICES, getChannelNames, getChannels, GqlChannel, HIDDEN_DEVICES, SHIPPED_DEVICES, VIEWPORTS} from '../support/channels'

describe('Channels - GraphQL API (jcontent.channels)', () => {
    before(() => {
        cy.login()
    })

    it('the channels module is started', () => {
        cy.apollo({queryFile: 'graphql/jcr/query/getStartedModulesVersion.graphql'}).then((resp: any) => {
            const modules: any[] = resp?.data?.dashboard?.modules ?? []
            expect(modules.map(m => m.id), 'started modules').to.include('channels')
        })
    })

    it('returns generic plus the shipped devices, and nothing else', () => {
        getChannelNames().should('deep.equal', ['generic', ...SHIPPED_DEVICES].sort())
    })

    it('generic_mobile is hidden, the other devices are visible', () => {
        getChannels().then(channels => {
            const visibility = Object.fromEntries(channels.map(c => [c.name, c.isVisible]))
            HIDDEN_DEVICES.forEach(name => expect(visibility[name], name).to.eq(false))
            DEVICES.forEach(d => expect(visibility[d.name], d.name).to.eq(true))
        })
    })

    it('each device has its display name, and its variants with the size of their frame', () => {
        getChannels().then(channels => {
            DEVICES.forEach(expected => {
                const device = channels.find(c => c.name === expected.name) as GqlChannel
                expect(device.displayName, expected.name).to.eq(expected.displayName)
                expect(device.variants.map(v => [v.name, Number(v.imageSize?.width), Number(v.imageSize?.height)]), expected.name)
                    .to.deep.equal(expected.variants.map(v => [v.name, v.frameWidth, v.frameHeight]))
            })
        })
    })

    it('viewports come in the order of their width', () => {
        getChannels().then(channels => {
            expect(channels.map(c => c.name).filter(name => name.startsWith('viewport_')))
                .to.deep.equal(VIEWPORTS.map(v => v.name))
            const widths = VIEWPORTS.map(v => Math.max(...v.variants.filter(x => x.name === v.variants[0].name).map(x => x.width)))
            expect(widths).to.deep.equal([...widths].sort((a, b) => a - b))
        })
    })

    it('the frame pictures are served', () => {
        DEVICES.forEach(d => d.variants.forEach(v => {
            cy.request(`/modules/channels/images/frames/${d.name}-${v.name}.svg`).then(response => {
                expect(response.status).to.eq(200)
                expect(response.headers['content-type']).to.contain('image/svg+xml')
                expect(response.body).to.contain(`width="${v.frameWidth}" height="${v.frameHeight}"`)
            })
        }))
    })
})
