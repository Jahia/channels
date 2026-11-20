// Returns, as JSON through setResult, ChannelService.matchChannel(SELECTED, getChannel(CURRENT)), i.e. whether
// a content item selected for SELECTED applies to the channel CURRENT, and the fallBack chain of CURRENT.
import groovy.json.JsonOutput
import org.jahia.services.channels.ChannelService

def service = ChannelService.getInstance()
def channel = service.getChannel("CURRENT")
def chain = []
def current = channel
while (current != null && current.getFallBack() != null && current.getFallBack() != "root" && chain.size() < 20) {
    chain << current.getFallBack()
    current = service.getChannel(current.getFallBack())
}
setResult(JsonOutput.toJson([match: service.matchChannel("SELECTED", channel), chain: chain]))
