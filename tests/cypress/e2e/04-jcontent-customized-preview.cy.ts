import {Button, Dropdown, getComponentByRole} from '@jahia/cypress'
import {expectFramedPreview, siteKey, USER_AGENT_DEVICES, VIEWPORTS, waitForChannelSelectorEnabled} from '../support/channels'

// jContent "Customized preview": the device selector is fed by jcontent.channels. The preview iframe gets the size of
// the frame of the selected variant (decorator-image-sizes) plus 16px (jContent customizedPreviewApp.jsx), and the
// module (ChannelPreviewFrameFilter) draws the frame around a nested iframe of the size of the screen (usable-resolutions).
// Relies on the site created by 03-live-user-agent-filter.cy.ts.
describe('Channels - jContent customized preview', () => {
    const previewParams = 'params=(openDialog:(key:customizedPreview,params:()))'
    const iframe = 'iframe[data-sel-role="customized-preview-iframe"]'
    const dialog = '[data-sel-role="customized-preview-dialog"]'
    const mobile360 = VIEWPORTS.find(v => v.name === 'viewport_0360').variants.find(v => v.name === 'portrait')

    beforeEach(() => {
        cy.loginAndStoreSession()
    })

    it('selecting "Mobile 360" shows the page in a 360x800 screen, inside the frame of the device', () => {
        cy.visit(`/jahia/jcontent/${siteKey}/en/pages/home?${previewParams}`)
        cy.get(iframe, {timeout: 30000}).should('be.visible')
            .invoke('attr', 'src').should('not.include', 'channel=')

        getComponentByRole(Button, 'customizedPreview').click()
        cy.get(dialog).should('be.visible')
        cy.get(`${dialog} [data-sel-role="channel-selector-dropdown"]`).should('exist')
        waitForChannelSelectorEnabled()

        const channelDropdown = getComponentByRole(Dropdown, 'channel-selector-dropdown')
        channelDropdown.select('Mobile 360')
        channelDropdown.get().should('contain', 'Mobile 360')
        cy.get(`${dialog} [data-sel-role="variant-selector-dropdown"]`).should('contain', 'Portrait')

        getComponentByRole(Button, 'show-preview-confirm').click()
        cy.get(dialog).should('not.exist')

        expect([mobile360.width, mobile360.height]).to.deep.equal([360, 800])
        cy.get(iframe).should('be.visible')
            .and('have.attr', 'width', String(mobile360.frameWidth + 16))
            .and('have.attr', 'height', String(mobile360.frameHeight + 16))
        cy.get(iframe).invoke('attr', 'src')
            .should('include', 'channel=viewport_0360')
            .and('include', 'variant=portrait')
        cy.get('[data-sel-role="customized-preview-header"]').should('contain', 'Mobile 360 (Portrait)')

        // the frame is the background of the wrapper page, the page itself is in a nested iframe of the size of the screen
        expectFramedPreview('viewport_0360', 'portrait', 'CHANNELS_MARKER_ALWAYS', false)
    })

    it('the device selector lists the viewports in the order of their width, and the User-Agent devices', () => {
        cy.visit(`/jahia/jcontent/${siteKey}/en/pages/home?${previewParams}`)
        cy.get(iframe, {timeout: 30000}).should('be.visible')
        getComponentByRole(Button, 'customizedPreview').click()
        cy.get(dialog).should('be.visible')
        waitForChannelSelectorEnabled()
        getComponentByRole(Dropdown, 'channel-selector-dropdown').get().click()
        // retried until the options are rendered
        cy.get('[role="option"]').should(options => {
            const labels = Cypress.$.makeArray(options).map(o => o.textContent.trim())
            const viewportLabels = VIEWPORTS.map(v => v.displayName)
            // the list also holds the placeholder and the core "Generic" channel
            expect(labels.filter(l => viewportLabels.includes(l)), 'viewports').to.deep.equal(viewportLabels)
            USER_AGENT_DEVICES.forEach(d => expect(labels, 'User-Agent devices').to.include(d.displayName))
            expect(labels, 'hidden fallback').not.to.include('Generic Phone')
        })
    })
})
