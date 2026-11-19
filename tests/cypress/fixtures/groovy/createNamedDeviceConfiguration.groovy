// Creates or updates the device configuration named CONFIG_NAME through the OSGi ConfigurationAdmin, so that its PID
// is predictable: org.jahia.community.modules.channels.device~CONFIG_NAME. PROPERTIES_JSON holds its properties.
import groovy.json.JsonSlurper
import org.jahia.osgi.BundleUtils
import org.osgi.service.cm.ConfigurationAdmin

def configurationAdmin = BundleUtils.getOsgiService(ConfigurationAdmin.class, null)
def configuration = configurationAdmin.getFactoryConfiguration("org.jahia.community.modules.channels.device", "CONFIG_NAME", "?")
def properties = new Hashtable(new JsonSlurper().parseText('''PROPERTIES_JSON'''))
configuration.update(properties)
setResult(configuration.getPid())
