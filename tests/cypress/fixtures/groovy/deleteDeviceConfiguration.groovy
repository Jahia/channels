import org.jahia.osgi.BundleUtils
import org.osgi.service.cm.ConfigurationAdmin

def configurationAdmin = BundleUtils.getOsgiService(ConfigurationAdmin.class, null)
def configurations = configurationAdmin.listConfigurations("(&(service.factoryPid=org.jahia.community.modules.channels.device)(identifier=DEVICE_IDENTIFIER))")
configurations?.each { configuration ->
    log.info("Deleting channel configuration " + configuration.getPid())
    configuration.delete()
}
log.info("Deleted " + (configurations?.length ?: 0) + " configuration(s) for channel DEVICE_IDENTIFIER")
