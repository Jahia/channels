import gql from 'graphql-tag'
import {createUser, deleteSite, getNodeByPath} from '@jahia/cypress'
import {createTestSite, DEVICES, groovyJson, HIDDEN_DEVICES, textItem} from '../support/channels'

// Content Editor (jContent): the channel visibility option is the jmix:channelSelection fieldset of the Visibility
// tab of the advanced options. Its channel list comes from the core "channels" choice list initializer, fed by the
// module; the fieldset requires the permission viewChannelsTab, which the module imports.
// jContent dependency: up to jContent 3.6.x, the Visibility tab of the advanced options renders the Channels
// component, which shows this fieldset. From jContent 3.7.0 (commit c52136df, "Add visibility conditions UI"), the
// Visibility dialog no longer renders it, and nothing else does: the UI tests are skipped there.
const JCONTENT_WITHOUT_CHANNELS_UI = [3, 7, 0]

describe('Channels - Content Editor channel visibility option', () => {
    let jcontentVersion = ''
    const channelsUiRendered = () => {
        const parts = jcontentVersion.split('.').slice(0, 3).map(n => parseInt(n, 10) || 0)
        for (let i = 0; i < 3; i++) {
            if (parts[i] !== JCONTENT_WITHOUT_CHANNELS_UI[i]) {
                return parts[i] < JCONTENT_WITHOUT_CHANNELS_UI[i]
            }
        }
        return false
    }
    const skipWithoutChannelsUi = (test: Mocha.Context) => {
        if (!channelsUiRendered()) {
            cy.log(`Skipped: jContent ${jcontentVersion} (3.7.0 or later) does not render the channel option of Content Editor`)
            test.skip()
        }
    }
    const site = 'channelsce'
    const itemPath = `/sites/${site}/home/pagecontent/edited`
    const fieldSet = 'span[data-sel-role-dynamic-fieldset="jmix:channelSelection"]'
    const channelsField = '[data-sel-content-editor-field="jmix:channelSelection_j:channelSelection"]'
    // test users of this spec only
    const userWith = 'cypress-channels-with'
    const userWithout = 'cypress-channels-without'
    // generated for each run, only used by the two users this spec creates and deletes
    const testPassword = `Cy-${Math.random().toString(36).slice(2, 12)}-A1!`
    const uuids: Record<string, string> = {}

    before(() => {
        cy.login()
        cy.executeGroovy('groovy/getBundleVersion.groovy', {SYMBOLIC_NAME: 'jcontent'}).then((version: unknown) => {
            jcontentVersion = String(version)
            expect(jcontentVersion, 'jContent version').to.match(/^\d+\.\d+\.\d+/)
        })
        cy.executeGroovy('groovy/removeChannelsTabRoles.groovy', {USER_NAMES: `${userWith},${userWithout}`})
        createTestSite(site, [textItem('edited', 'CE_EDITED_ITEM'), textItem('other', 'CE_OTHER_ITEM')], false)
        createUser(userWith, testPassword)
        createUser(userWithout, testPassword)
        cy.executeGroovy('groovy/setupChannelsTabRoles.groovy', {SITE_KEY: site, USER_GRANTED: userWith, USER_DENIED: userWithout})
            .should('eq', 'ok')
        ;[itemPath, `/sites/${site}/home/pagecontent/other`].forEach(path => {
            getNodeByPath(path).its('data.jcr.nodeByPath.uuid').then(uuid => {
                uuids[path] = uuid
            })
        })
    })

    after(() => {
        cy.logout()
        cy.login()
        deleteSite(site)
        cy.executeGroovy('groovy/removeChannelsTabRoles.groovy', {USER_NAMES: `${userWith},${userWithout}`})
    })

    const openVisibilityTab = (path: string, expectedUser = 'root') => {
        // the uuids are read in before(): a GraphQL call made with cy.apollo (basic authentication of root) from the
        // browser would turn the session of the browser into a root session
        cy.wrap(uuids[path], {log: false}).should('be.a', 'string').then(uuid => {
            cy.visit(`/jahia/jcontent/${site}/en/pages/home#(contentEditor:!((formKey:modal_0,isFullscreen:!t,lang:en,mode:edit,site:${site},uilang:en,uuid:'${uuid}')))`)
        })
        cy.get('[aria-labelledby="dialog-content-editor"]', {timeout: 30000}).should('be.visible')
        cy.window().its('contextJsParameters.user.username').should('eq', expectedUser)
        cy.get('.moonstone-tabItem[data-sel-role="tab-advanced-options"]').should('be.visible').click()
        cy.get('div[data-sel-role="advanced-options-nav"]').should('be.visible')
            .find('.moonstone-listItem').contains('Visibility').parent().parent().click()
        cy.get('[data-cm-role="visibilityScreen"]', {timeout: 30000}).should('be.visible')
    }

    it('the option lists the channels, viewports included; selecting one and saving sets j:channelSelection and j:channelIncludeOrExclude', function () {
        skipWithoutChannelsUi(this)
        cy.loginAndStoreSession()
        openVisibilityTab(itemPath)
        cy.get(fieldSet).should('be.visible')
        cy.get(`${fieldSet} input`).should('not.be.checked').click({force: true})
        cy.get(channelsField).should('be.visible').find('.moonstone-valueList_wrapper').first().should($left => {
            const labels = $left.find('li').toArray().map(li => li.textContent.trim())
            DEVICES.forEach(d => expect(labels, 'shipped devices').to.include(d.displayName))
            expect(labels, 'hidden fallback (all the channels are listed)').to.include('Generic Phone')
            expect(labels, 'core channel').to.include('Generic')
            expect(HIDDEN_DEVICES).to.deep.equal(['generic_mobile'])
        })
        cy.get(channelsField).find('.moonstone-valueList_wrapper').first().contains('Phone: iPhone').click()
        cy.get(channelsField).find('.moonstone-valueList_wrapper').last().should('contain', 'Phone: iPhone')
        cy.get('[data-sel-role="submitSave"]').click()
        cy.get('[role="alertdialog"]').should('be.visible').and('contain', 'Content successfully saved')

        cy.waitUntil(() => getNodeByPath(itemPath, ['j:channelSelection', 'j:channelIncludeOrExclude']).then((resp: any) => {
            const node = resp?.data?.jcr?.nodeByPath
            const props = Object.fromEntries((node?.properties ?? []).map(p => [p.name, p.values ?? p.value]))
            return JSON.stringify(props['j:channelSelection']) === JSON.stringify(['apple_iphone_ver1']) &&
                props['j:channelIncludeOrExclude'] === 'include'
        }), {errorMsg: 'j:channelSelection / j:channelIncludeOrExclude not saved (the form default of the mode is include)', timeout: 15000, interval: 1000})
    })

    it('the permission viewChannelsTab is imported by the module and granted through the roles', () => {
        groovyJson('hasPermission.groovy', {USER_NAME: 'root', NODE_PATH: `/sites/${site}`, PERMISSION: 'viewChannelsTab'}).then(r => {
            expect(r.permissionNodes, 'viewChannelsTab permission nodes').to.have.length.greaterThan(0)
            expect(r.permissionNodes.every((p: string) => p.endsWith('/jContent/engineTabs/viewChannelsTab')), r.permissionNodes.join(', ')).to.eq(true)
            expect(r.hasPermission, 'root').to.eq(true)
        })
        groovyJson('hasPermission.groovy', {USER_NAME: userWith, NODE_PATH: `/sites/${site}`, PERMISSION: 'viewChannelsTab'})
            .its('hasPermission').should('eq', true)
        groovyJson('hasPermission.groovy', {USER_NAME: userWithout, NODE_PATH: `/sites/${site}`, PERMISSION: 'viewChannelsTab'})
            .its('hasPermission').should('eq', false)
    })

    it('a user with viewChannelsTab sees the option', function () {
        skipWithoutChannelsUi(this)
        cy.logout()
        cy.loginAndStoreSession(userWith, testPassword)
        openVisibilityTab(`/sites/${site}/home/pagecontent/other`, userWith)
        cy.get(fieldSet).should('be.visible')
    })

    it('a user without viewChannelsTab does not see the option, the rest of the Visibility tab is shown', function () {
        skipWithoutChannelsUi(this)
        cy.logout()
        cy.loginAndStoreSession(userWithout, testPassword)
        openVisibilityTab(`/sites/${site}/home/pagecontent/other`, userWithout)
        cy.get('[data-sel-role-dynamic-fieldset="jmix:conditionalVisibility"]').should('be.visible')
        cy.get(fieldSet).should('not.exist')
    })

    it('the Content Editor form holds the option only for a user with viewChannelsTab', () => {
        const fieldSetVisibility = (username: string) => cy.apolloClient({username, password: testPassword})
            .apollo({
                query: gql`query channelsForm($path: String!) { forms { editForm(uiLocale: "en", locale: "en", uuidOrPath: $path) {
                    sections { name visible fieldSets { name visible } } } } }`,
                variables: {path: `/sites/${site}/home/pagecontent/other`},
                fetchPolicy: 'no-cache'
            })
            .then((resp: any) => resp.data.forms.editForm.sections as {name: string, visible: boolean, fieldSets: {name: string, visible: boolean}[]}[])
        const channelsFieldSet = (sections: {name: string, fieldSets: {name: string, visible: boolean}[]}[]) =>
            sections.flatMap(section => section.fieldSets).filter(fs => fs.name === 'jmix:channelSelection').map(fs => fs.visible)
        fieldSetVisibility(userWith).then(sections => {
            expect(channelsFieldSet(sections), JSON.stringify(sections)).to.deep.equal([true])
        })
        fieldSetVisibility(userWithout).then(sections => {
            expect(channelsFieldSet(sections), JSON.stringify(sections)).to.deep.equal([])
        })
        cy.apolloClient()
    })
})
