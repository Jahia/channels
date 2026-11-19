import {Button, deleteSite, Dropdown, getComponentByRole} from '@jahia/cypress';
import {
    createTestSite,
    deleteTestDeviceConfigurations,
    editDeviceConfiguration,
    expectFramedPreview,
    getChannels,
    measureScrollbarWidth,
    TEST_MARKER,
    textItem,
    waitForChannelNames,
    waitForChannelSelectorEnabled
} from '../support/channels';

// JContent customized preview: a landscape variant, a User-Agent device, and a device without frame. The preview
// iframe gets the size of the frame (decorator-image-sizes) plus 16px; with a frame, the core ChannelPreviewFilter
// places the page in a nested iframe of the size of the screen.
describe('Channels - jContent customized preview of other devices', () => {
    const tallItem = {
        name: 'tall',
        primaryNodeType: 'jnt:bigText',
        mixins: [],
        properties: [{name: 'text', language: 'en', value: Array.from({length: 150}, (_, i) => `<p>Line ${i}</p>`).join('')}]
    };
    const site = 'channelsjcpreview';
    const MARKER = 'JCPREVIEW_PAGE_CONTENT';
    const frameless = 'cypress_frameless_ui';
    const framelessLabel = 'Cypress frameless 1440';
    const previewParams = 'params=(openDialog:(key:customizedPreview,params:()))';
    const iframe = 'iframe[data-sel-role="customized-preview-iframe"]';
    const dialog = '[data-sel-role="customized-preview-dialog"]';

    before(() => {
        cy.login();
        deleteTestDeviceConfigurations();
        // A page higher than every screen, so that it would have a vertical scrollbar
        createTestSite(site, [textItem('always', MARKER), tallItem], false);
        editDeviceConfiguration('cypress-frameless-ui', {
            ...TEST_MARKER,
            identifier: frameless,
            'capability.display-name': framelessLabel,
            'capability.variants': 'landscape',
            'capability.variants-displayNames': 'Landscape',
            'capability.decorator-image-sizes': '1440x900'
        });
        waitForChannelNames(names => names.includes(frameless), `${frameless} present`);
    });

    after(() => {
        cy.login();
        deleteTestDeviceConfigurations();
        deleteSite(site);
    });

    beforeEach(() => {
        cy.loginAndStoreSession();
    });

    const openPreview = (deviceLabel: string, variantLabel?: string) => {
        cy.visit(`/jahia/jcontent/${site}/en/pages/home?${previewParams}`);
        cy.get(iframe, {timeout: 30000}).should('be.visible');
        getComponentByRole(Button, 'customizedPreview').click();
        cy.get(dialog).should('be.visible');
        waitForChannelSelectorEnabled();
        const channelDropdown = getComponentByRole(Dropdown, 'channel-selector-dropdown');
        channelDropdown.select(deviceLabel);
        channelDropdown.get().should('contain', deviceLabel);
        if (variantLabel) {
            const variantDropdown = getComponentByRole(Dropdown, 'variant-selector-dropdown');
            variantDropdown.select(variantLabel);
            variantDropdown.get().should('contain', variantLabel);
        }

        getComponentByRole(Button, 'show-preview-confirm').click();
        cy.get(dialog).should('not.exist');
    };

    it('the device selector lists the visible devices in the alphabetical order of their identifier', () => {
        cy.visit(`/jahia/jcontent/${site}/en/pages/home?${previewParams}`);
        cy.get(iframe, {timeout: 30000}).should('be.visible');
        getComponentByRole(Button, 'customizedPreview').click();
        cy.get(dialog).should('be.visible');
        waitForChannelSelectorEnabled();
        getComponentByRole(Dropdown, 'channel-selector-dropdown').get().click();
        getChannels().then(channels => {
            const expected = channels.filter(c => c.isVisible && c.name !== 'generic')
                .map(c => c.name).sort()
                .map(name => channels.find(c => c.name === name).displayName);
            expect(expected, 'devices of this test included').to.include(framelessLabel);
            cy.get('[role="option"]').should(options => {
                const labels = Cypress.$.makeArray(options).map(o => o.textContent.trim());
                expect(labels.filter(l => expected.includes(l)), 'order of the selector').to.deep.equal(expected);
            });
        });
    });

    it('"Mobile 360", variant "Landscape": the page is shown in an 800x360 screen, in the landscape frame', () => {
        openPreview('Mobile 360', 'Landscape');
        cy.get('[data-sel-role="customized-preview-header"]').should('contain', 'Mobile 360 (Landscape)');
        expectFramedPreview('viewport_0360', 'landscape', MARKER, true);
    });

    it('"Phone: iPhone" (a User-Agent device): the page is shown in a 390x844 screen', () => {
        openPreview('Phone: iPhone');
        cy.get('[data-sel-role="customized-preview-header"]').should('contain', 'Phone: iPhone (Portrait)');
        expectFramedPreview('apple_iphone_ver1', 'portrait', MARKER, true);
    });

    // A. no scrollbar around the device, b. width of the page, c. border, d. accessibility, for each kind of frame
    const frameKinds: {label: string, variantLabel?: string, device: string, variant: string}[] = [
        {label: 'Phone: Android', device: 'generic_android', variant: 'portrait'},
        {label: 'Tablet: iPad', variantLabel: 'Landscape', device: 'apple_ipad_ver1', variant: 'landscape'},
        {label: 'Laptop 1280', device: 'viewport_1280', variant: 'landscape'},
        {label: 'Desktop 1920', device: 'viewport_1920', variant: 'landscape'}
    ];
    frameKinds.forEach(c => {
        it(`"${c.label}" ${c.variant}: no scrollbar around the device, page width, no border, accessible wrapper`, () => {
            openPreview(c.label, c.variantLabel);
            expectFramedPreview(c.device, c.variant, MARKER, true);
        });
    });

    it('records the kind of scrollbars of the browser running the tests in results/scrollbars.txt', () => {
        // With overlay scrollbars (width 0), the width checks of the previewed page cannot fail; the presence of
        // the injected style is still checked
        cy.visit(`/jahia/jcontent/${site}/en/pages/home`);
        cy.document().then(doc => {
            const width = measureScrollbarWidth(doc);
            const text = `${Cypress.browser.name} ${Cypress.browser.version} ${Cypress.platform}: scrollbar width ${width}px (${width > 0 ? 'classic' : 'overlay'} scrollbars)`;
            cy.writeFile('results/scrollbars.txt', text);
            cy.readFile('results/scrollbars.txt').should('eq', text);
        });
    });

    it('a device without frame is shown without wrapper, at its decorator-image-sizes plus 16px', () => {
        openPreview(framelessLabel);
        cy.get(iframe).should('be.visible')
            .and('have.attr', 'width', String(1440 + 16))
            .and('have.attr', 'height', String(900 + 16));
        cy.get(iframe).invoke('attr', 'src').should('include', `channel=${frameless}`);
        cy.get(iframe).should($iframe => {
            const doc = ($iframe[0] as HTMLIFrameElement).contentDocument;
            expect(doc?.body?.textContent, 'page content').to.contain(MARKER);
            expect(doc?.querySelector('iframe'), 'no nested iframe').to.eq(null);
            expect(doc?.querySelector('.channels-frame'), 'no frame').to.eq(null);
            // The page itself, at the size of the jContent iframe (classic scrollbar excluded)
            const overflows = doc.documentElement.scrollHeight > doc.documentElement.clientHeight;
            const verticalScrollbar = overflows ? measureScrollbarWidth(doc) : 0;
            expect(doc.documentElement.clientWidth + verticalScrollbar, 'width of the page').to.eq(1440 + 16);
        });
    });
});
