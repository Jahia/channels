// Returns, as JSON through setResult, the channels as served by the core ChannelService: the list of all the
// channels and, for each identifier of CHANNEL_IDS (comma-separated), its fallBack, visibility and capabilities.
import groovy.json.JsonOutput
import org.jahia.services.channels.ChannelService

def service = ChannelService.getInstance()
def result = [all: service.getAllChannels(), channels: [:]]
"CHANNEL_IDS".split(",").findAll { it.trim() }.each { id ->
    def channel = service.getChannel(id.trim())
    result.channels[id.trim()] = [
            identifier  : channel.getIdentifier(),
            fallBack    : channel.getFallBack(),
            visible     : channel.isVisible(),
            capabilities: new TreeMap(channel.getCapabilities())
    ]
}
setResult(JsonOutput.toJson(result))
