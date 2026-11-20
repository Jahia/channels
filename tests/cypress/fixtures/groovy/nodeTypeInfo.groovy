// Returns, as JSON through setResult, the definition of the node type NODE_TYPE as registered in Jahia.
import groovy.json.JsonOutput
import org.jahia.services.content.nodetypes.NodeTypeRegistry

def type = NodeTypeRegistry.getInstance().getNodeType("NODE_TYPE")
def result = [
        name      : type.getName(),
        mixin     : type.isMixin(),
        module    : type.getSystemId(),
        extendsTypes: type.getMixinExtendNames() as List,
        properties: type.getDeclaredPropertyDefinitions().collect { definition ->
            [name        : definition.getName(),
             multiple    : definition.isMultiple(),
             autoCreated : definition.isAutoCreated(),
             selectorOptions: new TreeMap(definition.getSelectorOptions()),
             valueConstraints: definition.getValueConstraints() as List,
             defaultValues: definition.getDefaultValues()?.collect { it.getString() } ?: []]
        }
]
setResult(JsonOutput.toJson(result))
