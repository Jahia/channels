/*
 * Copyright (C) 2002-2026 Jahia Solutions Group SA. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.jahia.community.modules.channels.filters;

import org.jahia.services.channels.Channel;
import org.jahia.services.channels.ChannelService;
import org.jahia.services.render.RenderContext;
import org.jahia.services.render.Resource;
import org.jahia.services.render.filter.AbstractFilter;
import org.jahia.services.render.filter.RenderChain;
import org.jahia.services.render.filter.RenderFilter;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.slf4j.Logger;

import javax.jcr.Property;
import javax.jcr.RepositoryException;
import javax.jcr.Value;

/**
 * Render filter that includes or excludes a content item depending on the channel of the request.
 * <p>
 * It acts on the nodes that have the <code>jmix:channelSelection</code> mixin:
 * <ul>
 * <li><code>j:channelSelection</code> holds the identifiers of the selected channels;</li>
 * <li><code>j:channelIncludeOrExclude</code> tells whether the content is excluded for these channels
 * (<code>exclude</code>, the default) or only shown for them (<code>include</code>).</li>
 * </ul>
 * A channel matches a selected channel when it is that channel or falls back to it, see
 * {@link ChannelService#matchChannel(String, Channel)}.
 * <p>
 * The filter is registered as an OSGi service, which is how Jahia discovers render filters.
 */
@Component(service = RenderFilter.class)
public class ChannelExclusionFilter extends AbstractFilter {

    protected static Logger logger = org.slf4j.LoggerFactory.getLogger(ChannelExclusionFilter.class);

    @Activate
    public void activate() {
        // above 16, so that the filter runs behind the HTML cache: its result is cached, and a channel resolved from
        // the User-Agent header is part of the cache key
        setPriority(16.9f);
        setDescription("Exclude a module from render if it is excluded for the channel");
        setApplyOnConfigurations("module,wrappedcontent");
    }

    @Override
    public String prepare(RenderContext renderContext, Resource resource, RenderChain chain) throws Exception {
        if (resource.getNode().isNodeType("jmix:channelSelection")) {
            // we have a mixin applied, let's test if we must exclude it from the current channel.
            if (!resource.getNode().hasProperty("j:channelSelection")) {
                logger.warn("Channel selection activated on resource {} but no channels selected, please select channels for this function to be activated properly.", resource.getPath());
                return null;
            }
            return filterChannel(resource, renderContext);
        }
        return null;
    }

    /**
     * Returns what replaces a content item that is not rendered for the current channel.
     * <p>
     * Outside of the edit mode, or when a channel other than <code>generic</code> is previewed, the content is
     * removed. In the edit mode with the <code>generic</code> channel, the content stays, wrapped by the
     * <code>unselectedChannel</code> view, so that it can still be edited.
     *
     * @return an empty string to render nothing, or <code>null</code> to go on with the rendering
     */
    public String getExcludedResult(Resource resource, RenderContext context) {
        if (!context.isEditMode() || (context.getChannel() != null && !context.getChannel().getIdentifier().equals("generic"))) {
            return "";
        }
        if (!resource.hasWrapper("unselectedChannel")) {
            resource.pushWrapper("unselectedChannel");
        }
        return null;
    }

    /**
     * Applies the selection of the node to the current channel: in <code>exclude</code> mode the content is not
     * rendered when the channel matches one of the selected channels, in <code>include</code> mode it is not
     * rendered when the channel matches none of them.
     */
    private String filterChannel(Resource resource, RenderContext renderContext) throws RepositoryException {
        boolean isExcluding = isExcluding(resource);
        Value[] channelExclusionValues = getChannelExclusionValues(resource);
        Channel currentChannel = renderContext.getChannel();
        for (Value channelExclusionValue : channelExclusionValues) {
            String exclusionValueString = channelExclusionValue.getString();
            if (exclusionValueString != null && ChannelService.getInstance().matchChannel(exclusionValueString, currentChannel)) {
                return isExcluding ? getExcludedResult(resource, renderContext) : null;
            }
        }
        if (!isExcluding) {
            return getExcludedResult(resource, renderContext);
        }
        return null;
    }

    private static boolean isExcluding(Resource resource) throws RepositoryException {
        String channelRule = resource.getNode().hasProperty("j:channelIncludeOrExclude") ? resource.getNode().getProperty("j:channelIncludeOrExclude").getString() : "exclude";
        return channelRule.equalsIgnoreCase("exclude");
    }

    private static Value[] getChannelExclusionValues(Resource resource) throws RepositoryException {
        Property channelExclusionProperty = resource.getNode().getProperty("j:channelSelection");
        return channelExclusionProperty.getValues();
    }
}
