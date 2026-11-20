import {
    deleteDeviceConfiguration,
    editDeviceConfiguration,
    getChannels,
    GqlChannel,
    installDeviceConfigurationFile,
    SHIPPED_DEVICES,
    waitForChannelNames
} from '../support/channels';

// Devices are OSGi factory configurations (factory PID org.jahia.community.modules.channels.device).
// Configurations are added/changed through the Jahia provisioning API (installConfiguration / editConfiguration),
// and removed through the OSGi ConfigurationAdmin (groovy), since the provisioning API has no "remove" operation.
describe('Channels - devices declared by OSGi configuration at runtime', () => {
    const fromFile = 'cypress_from_file';
    const fromEdit = 'cypress_from_edit';

    before(() => {
        cy.login();
        deleteDeviceConfiguration(fromFile);
        deleteDeviceConfiguration(fromEdit);
        waitForChannelNames(names => !names.includes(fromFile) && !names.includes(fromEdit), 'test devices absent');
    });

    after(() => {
        deleteDeviceConfiguration(fromFile);
        deleteDeviceConfiguration(fromEdit);
    });

    it('a .cfg installed with installConfiguration adds a device, deleting the configuration removes it', () => {
        installDeviceConfigurationFile(fromFile, [
            `identifier = ${fromFile}`,
            'capability.display-name = Desktop: 1280px',
            'capability.variants = default',
            'capability.variants-displayNames = Default',
            'capability.decorator-image-sizes = 1280x800',
            ''
        ].join('\n'));
        waitForChannelNames(names => names.includes(fromFile), `${fromFile} present`);

        getChannels().then(channels => {
            const device = channels.find(c => c.name === fromFile);
            expect(device.displayName).to.eq('Desktop: 1280px');
            expect(device.isVisible, 'visible defaults to true').to.eq(true);
            expect(device.variants.map(v => [v.name, Number(v.imageSize.width), Number(v.imageSize.height)]))
                .to.deep.equal([['default', 1280, 800]]);
        });

        deleteDeviceConfiguration(fromFile);
        waitForChannelNames(names => !names.includes(fromFile), `${fromFile} removed`);
        // The shipped devices are untouched
        waitForChannelNames(names => SHIPPED_DEVICES.every(d => names.includes(d)), 'shipped devices still present');
    });

    const isUpdatedToV2 = (channels: GqlChannel[]) => {
        const device = channels.find(c => c.name === fromEdit);
        return Boolean(device) && device.displayName === 'Cypress device v2' && device.isVisible === false;
    };

    it('editConfiguration creates a device and later edits are applied without restart', () => {
        editDeviceConfiguration(fromEdit, {
            identifier: fromEdit,
            'capability.display-name': 'Cypress device v1'
        });
        waitForChannelNames(names => names.includes(fromEdit), `${fromEdit} present`);
        getChannels().its('length').should('eq', SHIPPED_DEVICES.length + 2);

        editDeviceConfiguration(fromEdit, {
            identifier: fromEdit,
            visible: 'false',
            'capability.display-name': 'Cypress device v2'
        });
        cy.waitUntil(() => getChannels().then(isUpdatedToV2), {errorMsg: `${fromEdit} not updated to v2 / not visible`, timeout: 30000, interval: 1000});

        deleteDeviceConfiguration(fromEdit);
        waitForChannelNames(names => !names.includes(fromEdit), `${fromEdit} removed`);
        getChannels().its('length').should('eq', SHIPPED_DEVICES.length + 1);
    });
});
