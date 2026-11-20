// Returns, as JSON through setResult, the lines of jahia.log that contain TOKEN (at most the last 50).
import groovy.json.JsonOutput

def dir = System.getProperty("jahia.log.dir") ?: "/var/log/jahia/"
def file = new File(dir, "jahia.log")
def lines = []
if (file.exists()) {
    file.eachLine("UTF-8") { line -> if (line.contains("TOKEN")) { lines << line } }
}
setResult(JsonOutput.toJson([file: file.getPath(), exists: file.exists(), lines: lines.takeRight(50)]))
