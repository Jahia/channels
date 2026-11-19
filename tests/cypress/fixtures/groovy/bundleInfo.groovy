// Returns, as JSON through setResult, what the installed channels bundle declares: its state, its Spring entries,
// its Require-Capability and Service-Component headers, and the state of its Declarative Services components.
import groovy.json.JsonOutput
import org.jahia.osgi.BundleUtils
import org.jahia.osgi.FrameworkService
import org.osgi.service.component.runtime.ServiceComponentRuntime

def bundle = FrameworkService.getBundleContext().getBundles().find { it.getSymbolicName() == "channels" }
def result = [found: bundle != null]
if (bundle != null) {
    def springEntries = bundle.findEntries("META-INF/spring", "*", true)
    result.state = bundle.getState()
    result.requiredVersion = bundle.getHeaders().get("Jahia-Required-Version")
    result.springEntries = springEntries ? Collections.list(springEntries).collect { it.getPath() } : []
    result.requireCapability = bundle.getHeaders().get("Require-Capability") ?: ""
    result.serviceComponent = bundle.getHeaders().get("Service-Component") ?: ""
    def scr = BundleUtils.getOsgiService(ServiceComponentRuntime.class, null)
    result.components = scr.getComponentDescriptionDTOs(bundle).collect { description ->
        [name: description.name,
         states: scr.getComponentConfigurationDTOs(description).collect { it.state }]
    }
}
setResult(JsonOutput.toJson(result))
