// Returns, as JSON through setResult, whether USER_NAME has the permission PERMISSION on NODE_PATH (default
// workspace), and whether the permission is registered (JCR node of the permission, in any module or in /permissions).
import groovy.json.JsonOutput
import org.jahia.services.content.JCRCallback
import org.jahia.services.content.JCRSessionWrapper
import org.jahia.services.content.JCRTemplate
import org.jahia.services.usermanager.JahiaUserManagerService

def user = JahiaUserManagerService.getInstance().lookupUser("USER_NAME").getJahiaUser()
def has = JCRTemplate.getInstance().doExecute(user, "default", null, { JCRSessionWrapper session ->
    session.getNode("NODE_PATH").hasPermission("PERMISSION")
} as JCRCallback)
def nodes = JCRTemplate.getInstance().doExecuteWithSystemSession({ JCRSessionWrapper session ->
    def result = []
    def it = session.getWorkspace().getQueryManager()
            .createQuery("select * from [jnt:permission] where localname() = 'PERMISSION'", "JCR-SQL2").execute().getNodes()
    while (it.hasNext()) { result << it.nextNode().getPath() }
    result
} as JCRCallback)
setResult(JsonOutput.toJson([hasPermission: has, permissionNodes: nodes]))
