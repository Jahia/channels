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

import org.jahia.api.Constants;
import org.jahia.services.channels.Channel;
import org.jahia.services.channels.ChannelService;
import org.jahia.services.render.RenderContext;
import org.jahia.services.render.Resource;
import org.jahia.services.render.filter.AbstractFilter;
import org.jahia.services.render.filter.RenderChain;
import org.jahia.services.render.filter.RenderFilter;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;

import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;

/**
 * Render filter that sets the channel of a request to a declared channel.
 * <p>
 * It applies the rules of the core <code>ChannelResolutionFilter</code>: the channel comes from, in this order, the
 * cookie <code>org.jahia.channels.activeChannel</code>, the <code>channel</code> request parameter (outside of the
 * live workspace) and the <code>User-Agent</code> header. A cookie or a parameter that does not name a declared
 * channel is ignored.
 * <p>
 * It runs before the core filter, which does nothing once the channel of the request is set.
 */
@Component(service = RenderFilter.class)
public class KnownChannelResolutionFilter extends AbstractFilter {

    // same names as the core ChannelResolutionFilter
    static final String ACTIVE_CHANNEL_COOKIE_NAME = "org.jahia.channels.activeChannel";
    static final String ACTIVE_CHANNEL_QUERY_PARAMETER = "channel";

    /**
     * Request attribute whose values are part of the key of the HTML cache.
     */
    private static final String CACHE_KEY_ATTRIBUTE = "module.cache.additional.key";

    @Activate
    public void activate() {
        // the core ChannelResolutionFilter has the priority 6 and no condition: this filter has to run first
        setPriority(5);
        setDescription("Sets the channel of the request, ignoring the channels that are not declared");
    }

    @Override
    public String prepare(RenderContext context, Resource resource, RenderChain chain) throws Exception {
        if (context.getChannel() == null) {
            context.setChannel(resolveChannel(context));
        }
        // this filter never replaces the rendering
        return null;
    }

    /**
     * Returns the channel of the request: from the cookie, else from the parameter, else from the User-Agent header.
     */
    private static Channel resolveChannel(RenderContext context) {
        ChannelService channelService = ChannelService.getInstance();
        HttpServletRequest request = context.getRequest();
        List<String> declaredChannels = channelService.getAllChannels();

        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (ACTIVE_CHANNEL_COOKIE_NAME.equals(cookie.getName())
                        && declaredChannels.contains(cookie.getValue())) {
                    return selected(request, channelService.getChannel(cookie.getValue()));
                }
            }
        }

        String parameter = request.getParameter(ACTIVE_CHANNEL_QUERY_PARAMETER);
        if (parameter != null && !parameter.isEmpty() && !Constants.LIVE_WORKSPACE.equals(context.getWorkspace())) {
            // as in the core filter, an unknown channel in the parameter means the generic channel
            return selected(request, channelService.getChannel(
                    declaredChannels.contains(parameter) ? parameter : Channel.GENERIC_CHANNEL));
        }

        Channel resolvedChannel = channelService.resolveChannel(request);
        if (resolvedChannel == null) {
            return channelService.getChannel(Channel.GENERIC_CHANNEL);
        }
        return selected(request, resolvedChannel);
    }

    /**
     * Makes the HTML cache keep a version of the page for the channel, unless it is the generic one, whatever the way
     * the channel was selected.
     */
    private static Channel selected(HttpServletRequest request, Channel channel) {
        if (!channel.isGeneric()) {
            addToCacheKey(request, channel.getIdentifier());
        }
        return channel;
    }

    /**
     * Adds a value to the key of the HTML cache for this request.
     */
    @SuppressWarnings("unchecked")
    private static void addToCacheKey(HttpServletRequest request, String channelIdentifier) {
        List<String> values = (List<String>) request.getAttribute(CACHE_KEY_ATTRIBUTE);
        if (values == null) {
            values = new ArrayList<>();
            request.setAttribute(CACHE_KEY_ATTRIBUTE, values);
        }
        values.add(channelIdentifier);
    }
}
