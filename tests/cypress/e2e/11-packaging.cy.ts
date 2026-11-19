import {groovyJson} from '../support/channels'

// What the installed bundle provides: the jmix:channelSelection mixin, and Declarative Services components
// instead of Spring.
describe('Channels - packaging', () => {
    before(() => {
        cy.login()
    })

    it('the mixin jmix:channelSelection is registered with its two properties, exclude by default', () => {
        groovyJson('nodeTypeInfo.groovy', {NODE_TYPE: 'jmix:channelSelection'}).then(type => {
            expect(type.mixin, 'mixin').to.eq(true)
            expect(type.module, 'declared by').to.eq('channels')
            expect(type.extendsTypes, 'extends').to.have.members(['jnt:content', 'jnt:area', 'jnt:template'])
            const props = Object.fromEntries(type.properties.map(p => [p.name, p]))
            expect(Object.keys(props)).to.have.members(['j:channelSelection', 'j:channelIncludeOrExclude'])
            expect(props['j:channelSelection'].multiple, 'j:channelSelection multiple').to.eq(true)
            expect(props['j:channelSelection'].selectorOptions, 'j:channelSelection choice list').to.have.property('channels')
            expect(props['j:channelIncludeOrExclude'].multiple).to.eq(false)
            expect(props['j:channelIncludeOrExclude'].autoCreated).to.eq(true)
            expect(props['j:channelIncludeOrExclude'].defaultValues, 'default').to.deep.equal(['exclude'])
            expect(props['j:channelIncludeOrExclude'].valueConstraints).to.have.members(['exclude', 'include'])
        })
    })

    it('the bundle uses no Spring: no META-INF/spring entry, no Spring or Blueprint extender, its DS components are active', () => {
        groovyJson('bundleInfo.groovy').then(bundle => {
            expect(bundle.found, 'channels bundle installed').to.eq(true)
            expect(bundle.state, 'ACTIVE').to.eq(32)
            expect(bundle.requiredVersion, 'Jahia-Required-Version (README: Jahia 8.2.0.0 or later)').to.eq('8.2.0.0')
            expect(bundle.springEntries, 'META-INF/spring entries').to.deep.equal([])
            expect(bundle.requireCapability.toLowerCase(), 'Require-Capability').not.to.match(/spring|blueprint/)
            expect(bundle.requireCapability, 'requires the DS extender').to.contain('osgi.extender=osgi.component')
            const components = Object.fromEntries(bundle.components.map(c => [c.name, c.states]))
            const expected = [
                'org.jahia.community.modules.channels.providers.ConfiguredChannelProvider',
                'org.jahia.community.modules.channels.filters.ChannelExclusionFilter',
                'org.jahia.community.modules.channels.filters.ChannelPreviewFrameFilter'
            ]
            expected.forEach(name => {
                expect(bundle.serviceComponent, 'Service-Component').to.contain(name)
                // ComponentConfigurationDTO.ACTIVE = 8
                expect(components[name], `${name} active`).to.deep.equal([8])
            })
            Object.keys(components).forEach(name => expect(components[name], `${name} active`).to.deep.equal([8]))
        })
    })
})
