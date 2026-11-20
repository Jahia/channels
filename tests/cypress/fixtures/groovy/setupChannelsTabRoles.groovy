// Creates two edit roles below "editor" (so they inherit its permissions), both with canSeeAdvancedOptionsTab so that
// Content Editor shows the advanced options and their Visibility tab:
// - cypress-channels-tab: also has viewChannelsTab on the current site;
// - cypress-no-channels-tab: does not have viewChannelsTab.
// Grants them on the site SITE_KEY to the users USER_GRANTED and USER_DENIED.
import org.jahia.services.content.JCRCallback
import org.jahia.services.content.JCRSessionWrapper
import org.jahia.services.content.JCRTemplate

JCRTemplate.getInstance().doExecuteWithSystemSession({ JCRSessionWrapper session ->
    def editor = session.getNode("/roles/editor")
    ["cypress-channels-tab", "cypress-no-channels-tab"].each { name ->
        if (session.nodeExists("/roles/editor/" + name)) {
            session.getNode("/roles/editor/" + name).remove()
        }
        def role = editor.addNode(name, "jnt:role")
        role.setProperty("j:roleGroup", "edit-role")
        role.setProperty("j:privilegedAccess", true)
        role.setProperty("j:permissionNames", ["canSeeAdvancedOptionsTab"] as String[])
        if (name == "cypress-channels-tab") {
            def access = role.addNode("currentSite-access", "jnt:externalPermissions")
            access.setProperty("j:path", "currentSite")
            access.setProperty("j:permissionNames", ["viewChannelsTab"] as String[])
        }
    }
    session.save()
    def site = session.getNode("/sites/SITE_KEY")
    site.grantRoles("u:USER_GRANTED", ["editor", "cypress-channels-tab"] as Set)
    site.grantRoles("u:USER_DENIED", ["editor", "cypress-no-channels-tab"] as Set)
    session.save()
    null
} as JCRCallback)
setResult("ok")
