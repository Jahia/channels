// Returns, through setResult, the version of the bundle SYMBOLIC_NAME (empty if it is not installed).
import org.jahia.osgi.FrameworkService

def bundle = FrameworkService.getBundleContext().getBundles().find { it.getSymbolicName() == "SYMBOLIC_NAME" }
setResult(bundle != null ? bundle.getVersion().toString() : "")
