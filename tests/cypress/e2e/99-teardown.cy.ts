import {deleteSite} from '@jahia/cypress';
import {siteKey} from '../support/channels';

describe('Channels - teardown', () => {
    it('deletes the test site', () => {
        cy.login();
        deleteSite(siteKey);
    });
});
