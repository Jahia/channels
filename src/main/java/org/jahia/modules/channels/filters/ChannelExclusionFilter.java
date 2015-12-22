/**
 * ==========================================================================================
 * =                   JAHIA'S DUAL LICENSING - IMPORTANT INFORMATION                       =
 * ==========================================================================================
 *
 *                                 http://www.jahia.com
 *
 *     Copyright (C) 2002-2016 Jahia Solutions Group SA. All rights reserved.
 *
 *     THIS FILE IS AVAILABLE UNDER TWO DIFFERENT LICENSES:
 *     1/GPL OR 2/JSEL
 *
 *     1/ GPL
 *     ==================================================================================
 *
 *     IF YOU DECIDE TO CHOOSE THE GPL LICENSE, YOU MUST COMPLY WITH THE FOLLOWING TERMS:
 *
 *     This program is free software: you can redistribute it and/or modify
 *     it under the terms of the GNU General Public License as published by
 *     the Free Software Foundation, either version 3 of the License, or
 *     (at your option) any later version.
 *
 *     This program is distributed in the hope that it will be useful,
 *     but WITHOUT ANY WARRANTY; without even the implied warranty of
 *     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 *     GNU General Public License for more details.
 *
 *     You should have received a copy of the GNU General Public License
 *     along with this program. If not, see <http://www.gnu.org/licenses/>.
 *
 *
 *     2/ JSEL - Commercial and Supported Versions of the program
 *     ===================================================================================
 *
 *     IF YOU DECIDE TO CHOOSE THE JSEL LICENSE, YOU MUST COMPLY WITH THE FOLLOWING TERMS:
 *
 *     Alternatively, commercial and supported versions of the program - also known as
 *     Enterprise Distributions - must be used in accordance with the terms and conditions
 *     contained in a separate written agreement between you and Jahia Solutions Group SA.
 *
 *     If you are unsure which license is appropriate for your use,
 *     please contact the sales department at sales@jahia.com.
 */
package org.jahia.modules.channels.filters;

import org.jahia.services.channels.Channel;
import org.jahia.services.channels.ChannelService;
import org.jahia.services.render.RenderContext;
import org.jahia.services.render.Resource;
import org.jahia.services.render.filter.AbstractFilter;
import org.jahia.services.render.filter.RenderChain;
import org.slf4j.Logger;

import javax.jcr.Property;
import javax.jcr.Value;

/**
 * This filter will exclude a module rendering from a node if it has the associated configuration.
 */
public class ChannelExclusionFilter extends AbstractFilter {

    protected transient static Logger logger = org.slf4j.LoggerFactory.getLogger(ChannelExclusionFilter.class);

    private ChannelService channelService;

    public void setChannelService(ChannelService channelService) {
        this.channelService = channelService;
    }

    @Override
    public String prepare(RenderContext renderContext, Resource resource, RenderChain chain) throws Exception {
        if (resource.getNode().isNodeType("jmix:channelSelection")) {
            // we have a mixin applied, let's test if we must exclude it from the current channel.
            if (!resource.getNode().hasProperty("j:channelSelection")) {
                logger.warn("Channel selection activated on resource "+resource.getPath()+" but no channels selected, please select channels for this function to be activated properly.");
                return null;
            }
            Property channelExclusionProperty = resource.getNode().getProperty("j:channelSelection");
            String includeOrExclude = resource.getNode().hasProperty("j:channelIncludeOrExclude") ? resource.getNode().getProperty("j:channelIncludeOrExclude").getString() : "exclude";
            Value[] channelExclusionValues = channelExclusionProperty.getValues();
            Channel currentChannel = renderContext.getChannel();
            for (Value channelExclusionValue : channelExclusionValues) {
                if (channelExclusionValue.getString() != null) {
                    boolean inList = channelService.matchChannel(channelExclusionValue.getString(), currentChannel);
                    if (inList && includeOrExclude.equals("exclude")) {
                        return getExcludedResult(resource, renderContext);
                    }
                    if (inList && includeOrExclude.equals("include")) {
                        return null;
                    }
                }
            }
            if (includeOrExclude.equals("include")) {
                return getExcludedResult(resource, renderContext);
            }
        }
        return null;
    }

    public String getExcludedResult(Resource resource, RenderContext context) {
        if (!context.isEditMode() || (context.getChannel() != null && !context.getChannel().getIdentifier().equals("generic"))) {
            return "";
        }
        if (!resource.hasWrapper("unselectedChannel")) {
            resource.pushWrapper("unselectedChannel");
        }
        return null;
    }

}
