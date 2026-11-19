// Removes the roles created by setupChannelsTabRoles.groovy, and the users USER_NAMES (comma-separated).
import org.jahia.services.content.JCRCallback
import org.jahia.services.content.JCRSessionWrapper
import org.jahia.services.content.JCRTemplate
import org.jahia.services.usermanager.JahiaUserManagerService

JCRTemplate.getInstance().doExecuteWithSystemSession({ JCRSessionWrapper session ->
    def userManager = JahiaUserManagerService.getInstance()
    "USER_NAMES".split(",").findAll { it }.each { name ->
        def path = userManager.getUserPath(name)
        if (path != null) {
            userManager.deleteUser(path, session)
        }
    }
    ["cypress-channels-tab", "cypress-no-channels-tab"].each { name ->
        if (session.nodeExists("/roles/editor/" + name)) {
            session.getNode("/roles/editor/" + name).remove()
        }
    }
    session.save()
    null
} as JCRCallback)
setResult("ok")
