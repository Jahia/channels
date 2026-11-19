import {
    deleteTestDeviceConfigurations,
    editDeviceConfiguration,
    getChannelNames,
    getChannels,
    getLogLines,
    getServedChannels,
    installDeviceConfigurationFile,
    runId,
    SHIPPED_DEVICES,
    TEST_MARKER,
    waitForChannelNames
} from '../support/channels'

// Configuration of the devices: validation, duplicates, defaults, the values of the shipped devices, and the
// lifecycle of the bundle. Values that GraphQL does not expose (fallBack, capabilities) are read from the core
// ChannelService with groovy.
describe('Channels - device configurations', () => {
    const ALL_SHIPPED = ['generic', ...SHIPPED_DEVICES].sort()

    before(() => {
        cy.login()
        deleteTestDeviceConfigurations()
        waitForChannelNames(names => names.length === ALL_SHIPPED.length, 'only the shipped devices')
    })

    afterEach(() => {
        deleteTestDeviceConfigurations()
        waitForChannelNames(names => names.length === ALL_SHIPPED.length, 'test devices removed')
    })

    it('invalid configurations (no identifier, invalid userAgentPattern) are ignored and do not disturb the others', () => {
        const id = runId()
        const badRegexDevice = `cypress_bad_regex_${id}`
        const sentinel = `cypress_sentinel_${id}`
        editDeviceConfiguration(`cypress-no-identifier-${id}`, {
            ...TEST_MARKER,
            'capability.display-name': `No identifier ${id}`
        })
        editDeviceConfiguration(`cypress-bad-regex-${id}`, {
            ...TEST_MARKER,
            identifier: badRegexDevice,
            'capability.display-name': 'Bad regex',
            'capability.userAgentPattern': '.*[unclosed'
        })
        // configurations of a factory are delivered in order: once this one is in, the two above were processed
        editDeviceConfiguration(`cypress-sentinel-${id}`, {...TEST_MARKER, identifier: sentinel})
        waitForChannelNames(names => names.includes(sentinel), `${sentinel} present`)

        getChannelNames().should('deep.equal', [...ALL_SHIPPED, sentinel].sort())
        getChannels().then(channels => {
            expect(channels.map(c => c.displayName), 'display names').not.to.include(`No identifier ${id}`)
        })

        // the reasons are logged by the Configuration Admin
        cy.waitUntil(() => getLogLines('The channel identifier is mandatory').then(lines => lines.some(l => l.includes('caused a problem'))),
            {errorMsg: 'no log line for the missing identifier', timeout: 15000, interval: 1000})
        cy.waitUntil(() => getLogLines('Invalid regular expression: .*[unclosed').then(lines => lines.length > 0),
            {errorMsg: 'no log line for the invalid regular expression', timeout: 15000, interval: 1000})
    })

    it('a configuration that becomes invalid no longer declares its device', () => {
        const id = runId()
        const device = `cypress_edited_${id}`
        const config = `cypress-edited-${id}`
        editDeviceConfiguration(config, {...TEST_MARKER, identifier: device, 'capability.userAgentPattern': '.*CypressEdited.*'})
        waitForChannelNames(names => names.includes(device), `${device} present`)

        editDeviceConfiguration(config, {...TEST_MARKER, identifier: device, 'capability.userAgentPattern': '.*[unclosed'})
        waitForChannelNames(names => !names.includes(device), `${device} removed by the invalid edit`)
        getChannelNames().should('deep.equal', ALL_SHIPPED)
    })

    it('the identifier generic cannot be used by a device', () => {
        const id = runId()
        const sentinel = `cypress_sentinel_${id}`
        editDeviceConfiguration(`cypress-generic-${id}`, {...TEST_MARKER, identifier: 'generic', 'capability.display-name': `Renamed ${id}`})
        editDeviceConfiguration(`cypress-sentinel-${id}`, {...TEST_MARKER, identifier: sentinel})
        waitForChannelNames(names => names.includes(sentinel), `${sentinel} present`)

        getChannels().then(channels => {
            expect(channels.find(c => c.name === 'generic').displayName, 'generic unchanged').to.eq('Generic')
        })
        getServedChannels(['generic']).then(served => {
            expect(served.channels.generic.fallBack, 'fallBack of generic unchanged').to.eq('root')
        })
        cy.waitUntil(() => getLogLines('The generic channel is declared by Jahia').then(lines => lines.length > 0),
            {errorMsg: 'no log line for the reserved identifier', timeout: 15000, interval: 1000})
    })

    it('two configurations with the same identifier give one channel', () => {
        const id = runId()
        const duplicate = `cypress_duplicate_${id}`
        installDeviceConfigurationFile(`cypress-dup-1-${id}`, `cypress.test = true\nidentifier = ${duplicate}\ncapability.display-name = Duplicate one\n`)
        installDeviceConfigurationFile(`cypress-dup-2-${id}`, `cypress.test = true\nidentifier = ${duplicate}\ncapability.display-name = Duplicate two\n`)
        cy.waitUntil(() => getLogLines(`Channel ${duplicate} is declared by more than one configuration`).then(lines => lines.length > 0),
            {errorMsg: 'no warning for the duplicate identifier', timeout: 30000, interval: 1000})

        getChannels().then(channels => {
            const matching = channels.filter(c => c.name === duplicate)
            expect(matching, `${duplicate} listed once`).to.have.length(1)
            expect(['Duplicate one', 'Duplicate two']).to.include(matching[0].displayName)
        })
        getServedChannels([]).its('all').then(all => {
            expect(all.filter((c: string) => c === duplicate), 'ChannelService.getAllChannels').to.have.length(1)
        })
    })

    it('fallBack defaults to generic, visible to true, and custom capabilities are exposed', () => {
        const id = runId()
        const device = `cypress_defaults_${id}`
        const custom = `cypress_custom_${id}`
        editDeviceConfiguration(`cypress-defaults-${id}`, {
            ...TEST_MARKER,
            identifier: device,
            'capability.display-name': 'Defaults',
            'capability.cypress-capability': 'some value'
        })
        editDeviceConfiguration(`cypress-custom-${id}`, {
            ...TEST_MARKER,
            identifier: custom,
            fallBack: 'generic_mobile',
            visible: 'false',
            'capability.display-name': 'Custom'
        })
        waitForChannelNames(names => names.includes(device) && names.includes(custom), 'both devices present')

        getServedChannels([device, custom]).then(({channels}) => {
            expect(channels[device].fallBack, 'default fallBack').to.eq('generic')
            expect(channels[device].visible, 'default visible').to.eq(true)
            expect(channels[device].capabilities, 'capabilities').to.deep.equal({
                'display-name': 'Defaults',
                'cypress-capability': 'some value'
            })
            expect(channels[custom].fallBack, 'declared fallBack').to.eq('generic_mobile')
            expect(channels[custom].visible, 'declared visible').to.eq(false)
        })
        getChannels().then(channels => {
            expect(channels.find(c => c.name === device).isVisible, `${device} isVisible`).to.eq(true)
            expect(channels.find(c => c.name === custom).isVisible, `${custom} isVisible`).to.eq(false)
        })
    })

    it('the shipped User-Agent devices have the documented userAgentPattern and fallBack, and their template-type-mapping', () => {
        // userAgentPattern and the fallBack chain: README "Shipped devices". template-type-mapping: the shipped .cfg
        // files (README documents the key, not the values).
        const expected = {
            apple_iphone_ver1: {userAgentPattern: '.*iPhone.*', fallBack: 'generic_mobile', templateType: 'iphone'},
            generic_android: {userAgentPattern: '.*Android.*Mobile.*', fallBack: 'generic_mobile', templateType: 'android'},
            apple_ipad_ver1: {userAgentPattern: '.*iPad.*', fallBack: 'generic', templateType: 'ipad'},
            android_tablet: {userAgentPattern: '.*Android(?!.*Mobile).*', fallBack: 'generic', templateType: 'tablet'},
            generic_mobile: {userAgentPattern: undefined, fallBack: 'generic', templateType: 'mobile'}
        }
        getServedChannels(Object.keys(expected)).then(({channels}) => {
            Object.keys(expected).forEach(id => {
                expect(channels[id].capabilities.userAgentPattern, `${id} userAgentPattern`).to.eq(expected[id].userAgentPattern)
                expect(channels[id].fallBack, `${id} fallBack`).to.eq(expected[id].fallBack)
                expect(channels[id].capabilities['template-type-mapping'], `${id} template-type-mapping`).to.eq(expected[id].templateType)
            })
            expect(channels.generic_mobile.visible, 'generic_mobile hidden').to.eq(false)
            // CHANGELOG "Removed": capabilities of the iPhone, iPad and Android devices
            ;['apple_iphone_ver1', 'apple_ipad_ver1', 'generic_android', 'android_tablet'].forEach(id => {
                ['device-image', 'resolution_width', 'resolution_height', 'full_flash_support'].forEach(capability => {
                    expect(channels[id].capabilities, `${id} has no ${capability}`).not.to.have.property(capability)
                })
            })
        })
    })

    describe('bundle lifecycle', () => {
        after(() => {
            // whatever happened, leave the module started with all its devices
            cy.runProvisioningScript({script: [{startBundle: 'channels'}]})
            waitForChannelNames(names => SHIPPED_DEVICES.every(d => names.includes(d)), 'shipped devices back')
        })

        it('stopping the channels bundle removes all its channels, starting it restores them', () => {
            cy.runProvisioningScript({script: [{stopBundle: 'channels'}]})
            waitForChannelNames(names => names.length === 1 && names[0] === 'generic', 'only generic left')
            getServedChannels([]).its('all').should('deep.equal', ['generic'])

            cy.runProvisioningScript({script: [{startBundle: 'channels'}]})
            waitForChannelNames(names => names.length === ALL_SHIPPED.length, 'all shipped devices back')
            getChannelNames().should('deep.equal', ALL_SHIPPED)
        })
    })
})
