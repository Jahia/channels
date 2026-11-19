// Deletes the device configurations created by the tests: they carry the property cypress.test = true, which the
// module ignores (only identifier, fallBack, visible and capability.* are read).
import org.jahia.osgi.BundleUtils
import org.osgi.service.cm.ConfigurationAdmin

def configurationAdmin = BundleUtils.getOsgiService(ConfigurationAdmin.class, null)
def configurations = configurationAdmin.listConfigurations("(&(service.factoryPid=org.jahia.community.modules.channels.device)(cypress.test=true))")
configurations?.each { configuration ->
    log.info("Deleting test channel configuration " + configuration.getPid())
    configuration.delete()
}
setResult(String.valueOf(configurations?.length ?: 0))
