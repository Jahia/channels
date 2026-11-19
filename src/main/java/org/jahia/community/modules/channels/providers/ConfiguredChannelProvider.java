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
package org.jahia.community.modules.channels.providers;

import org.jahia.services.channels.Channel;
import org.jahia.services.channels.ChannelProvider;
import org.jahia.services.channels.ChannelService;
import org.osgi.framework.Constants;
import org.osgi.service.cm.ConfigurationException;
import org.osgi.service.cm.ManagedServiceFactory;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.ConfigurationPolicy;
import org.osgi.service.component.annotations.Deactivate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Dictionary;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * Channel provider whose channels (devices) are declared through OSGi factory configurations, one configuration
 * per channel: <code>org.jahia.community.modules.channels.device-&lt;name&gt;.cfg</code>.
 * <p>
 * Supported keys:
 * <ul>
 * <li><code>identifier</code> (mandatory): the channel identifier</li>
 * <li><code>fallBack</code> (optional, defaults to <code>generic</code>): identifier of the fallback channel</li>
 * <li><code>visible</code> (optional, defaults to <code>true</code>): whether the channel is offered in the UI</li>
 * <li><code>capability.&lt;name&gt;</code>: a channel capability, for example
 * <code>capability.display-name</code> or <code>capability.userAgentPattern</code></li>
 * </ul>
 * <p>
 * The component is a {@link ManagedServiceFactory}: the Configuration Admin calls {@link #updated} for each
 * configuration of the factory PID, at startup and whenever one is created or changed, and {@link #deleted} when one
 * is removed. It registers itself in the core {@link ChannelService}, a singleton that is not an OSGi service, when
 * it is activated, and unregisters when it is deactivated.
 * <p>
 * A channel that declares the <code>userAgentPattern</code> capability is resolved for the requests whose
 * <code>User-Agent</code> header matches this regular expression. The patterns are evaluated in the alphabetical
 * order of the channel identifiers, and the first match wins.
 */
@Component(service = ManagedServiceFactory.class, immediate = true, configurationPolicy = ConfigurationPolicy.IGNORE,
        property = Constants.SERVICE_PID + "=" + ConfiguredChannelProvider.FACTORY_PID)
public class ConfiguredChannelProvider implements ChannelProvider, ManagedServiceFactory {

    public static final String FACTORY_PID = "org.jahia.community.modules.channels.device";
    public static final String USER_AGENT_HEADER_NAME = "user-agent";
    public static final String USER_AGENT_PATTERN_CAPABILITY = "userAgentPattern";

    private static final Logger logger = LoggerFactory.getLogger(ConfiguredChannelProvider.class);

    private static final String IDENTIFIER_KEY = "identifier";
    private static final String FALLBACK_KEY = "fallBack";
    private static final String VISIBLE_KEY = "visible";
    private static final String CAPABILITY_PREFIX = "capability.";
    /**
     * Above the core provider of the <code>generic</code> channel (-99): providers are asked in ascending order.
     */
    private static final int PRIORITY = 10;

    /**
     * Only the beginning of the User-Agent header is matched against the patterns.
     */
    private static final int MAX_USER_AGENT_LENGTH = 1024;

    /**
     * Channels by configuration PID, as received from the Configuration Admin.
     */
    private final Map<String, Channel> channelsByPid = new ConcurrentHashMap<>();

    /**
     * The channels as seen by the rendering threads: an immutable view, replaced on each configuration change.
     */
    private static final class Snapshot {
        static final Snapshot EMPTY = new Snapshot(Collections.<String, Channel>emptyMap(),
                Collections.<Pattern, String>emptyMap());

        /**
         * The channels by identifier, sorted by identifier.
         */
        final Map<String, Channel> channels;

        /**
         * The identifiers of the channels by User-Agent pattern, in the order of the identifiers.
         */
        final Map<Pattern, String> userAgentChannels;

        Snapshot(Map<String, Channel> channels, Map<Pattern, String> userAgentChannels) {
            this.channels = Collections.unmodifiableMap(channels);
            this.userAgentChannels = Collections.unmodifiableMap(userAgentChannels);
        }
    }

    private final AtomicReference<Snapshot> snapshot = new AtomicReference<>(Snapshot.EMPTY);

    /**
     * Whether the provider is registered in the channel service. Configurations can be delivered before the
     * activation: they are kept, and published when the provider registers. Read and written under the lock of
     * this object, like the registration itself.
     */
    private volatile boolean active;

    @Activate
    public synchronized void activate() {
        active = true;
        ChannelService.getInstance().addProvider(this);
        logger.info("Channel provider registered with {} channel(s)", snapshot.get().channels.size());
    }

    @Deactivate
    public synchronized void deactivate() {
        active = false;
        ChannelService.getInstance().removeProvider(this);
        logger.info("Channel provider unregistered");
    }

    @Override
    public String getName() {
        return "Jahia Channels device definitions";
    }

    @Override
    public void updated(String pid, Dictionary<String, ?> properties) throws ConfigurationException {
        Channel channel;
        try {
            channel = toChannel(properties);
        } catch (ConfigurationException e) {
            // an invalid configuration declares no channel, even if its previous version was valid
            if (channelsByPid.remove(pid) != null) {
                refresh();
            }
            throw e;
        }
        channelsByPid.put(pid, channel);
        refresh();
        logger.info("Channel {} registered from configuration {}", channel.getIdentifier(), pid);
    }

    @Override
    public void deleted(String pid) {
        Channel channel = channelsByPid.remove(pid);
        if (channel != null) {
            refresh();
            logger.info("Channel {} unregistered (configuration {} deleted)", channel.getIdentifier(), pid);
        }
    }

    /**
     * Builds a channel from a configuration.
     *
     * @throws ConfigurationException if the identifier is missing or the <code>userAgentPattern</code> capability is
     *                                not a valid regular expression; the configuration is then ignored
     */
    private static Channel toChannel(Dictionary<String, ?> properties) throws ConfigurationException {
        String identifier = getString(properties, IDENTIFIER_KEY);
        if (identifier == null) {
            throw new ConfigurationException(IDENTIFIER_KEY, "The channel identifier is mandatory");
        }
        if (Channel.GENERIC_CHANNEL.equals(identifier)) {
            throw new ConfigurationException(IDENTIFIER_KEY, "The generic channel is declared by Jahia");
        }

        Channel channel = new Channel();
        channel.setIdentifier(identifier);
        String fallBack = getString(properties, FALLBACK_KEY);
        if (fallBack != null) {
            channel.setFallBack(fallBack);
        }
        String visible = getString(properties, VISIBLE_KEY);
        if (visible != null) {
            channel.setVisible(Boolean.parseBoolean(visible));
        }

        Map<String, String> capabilities = new HashMap<>();
        for (Enumeration<String> keys = properties.keys(); keys.hasMoreElements(); ) {
            String key = keys.nextElement();
            if (key.startsWith(CAPABILITY_PREFIX) && key.length() > CAPABILITY_PREFIX.length()) {
                String value = getString(properties, key);
                if (value != null) {
                    capabilities.put(key.substring(CAPABILITY_PREFIX.length()), value);
                }
            }
        }
        String userAgentPattern = capabilities.get(USER_AGENT_PATTERN_CAPABILITY);
        if (userAgentPattern != null) {
            try {
                Pattern.compile(userAgentPattern);
            } catch (PatternSyntaxException e) {
                throw new ConfigurationException(CAPABILITY_PREFIX + USER_AGENT_PATTERN_CAPABILITY,
                        "Invalid regular expression: " + userAgentPattern, e);
            }
        }
        channel.setCapabilities(capabilities);
        return channel;
    }

    /**
     * Returns the trimmed value of a property, or <code>null</code> if it is missing or blank.
     */
    private static String getString(Dictionary<String, ?> properties, String key) {
        Object value = properties.get(key);
        if (value == null) {
            return null;
        }
        String result = value.toString().trim();
        return result.isEmpty() ? null : result;
    }

    /**
     * Rebuilds the read-only views and makes the channel service drop its cached channels.
     */
    private synchronized void refresh() {
        // sorted by identifier, so that the resolution order does not depend on the order of the configurations
        Map<String, Channel> newChannels = new TreeMap<>();
        for (Map.Entry<String, Channel> entry : new TreeMap<>(channelsByPid).entrySet()) {
            Channel channel = entry.getValue();
            if (newChannels.put(channel.getIdentifier(), channel) != null) {
                logger.warn("Channel {} is declared by more than one configuration, using the one from {}",
                        channel.getIdentifier(), entry.getKey());
            }
        }
        breakFallBackCycles(newChannels);
        Map<Pattern, String> newUserAgentChannels = new LinkedHashMap<>();
        for (Channel channel : newChannels.values()) {
            if (channel.hasCapabilityValue(USER_AGENT_PATTERN_CAPABILITY)) {
                newUserAgentChannels.put(Pattern.compile(channel.getCapability(USER_AGENT_PATTERN_CAPABILITY)),
                        channel.getIdentifier());
            }
        }
        boolean changed = !sameChannels(snapshot.get().channels, newChannels);
        snapshot.set(new Snapshot(newChannels, newUserAgentChannels));
        if (active && changed) {
            // adding the provider again clears the channels cached by the service
            ChannelService.getInstance().addProvider(this);
        }
    }

    /**
     * Fallback cycles are not supported: a channel that falls back to itself, directly or through other channels of
     * this provider, falls back to the generic channel instead.
     */
    private static void breakFallBackCycles(Map<String, Channel> channels) {
        for (Map.Entry<String, Channel> entry : channels.entrySet()) {
            Channel current = entry.getValue();
            // a chain without cycle visits each channel at most once
            for (int steps = 0; current != null && steps <= channels.size(); steps++) {
                current = channels.get(current.getFallBack());
                if (current == entry.getValue()) {
                    logger.error("Channel {} falls back to itself, directly or through other channels: "
                            + "falling back to {} instead", entry.getKey(), Channel.GENERIC_CHANNEL);
                    entry.setValue(copyWithGenericFallBack(entry.getValue()));
                    break;
                }
            }
        }
    }

    /**
     * Tells whether two sets of channels are the same: identifiers, fallbacks, visibility and capabilities.
     */
    private static boolean sameChannels(Map<String, Channel> first, Map<String, Channel> second) {
        if (!first.keySet().equals(second.keySet())) {
            return false;
        }
        for (Map.Entry<String, Channel> entry : first.entrySet()) {
            Channel a = entry.getValue();
            Channel b = second.get(entry.getKey());
            if (a.isVisible() != b.isVisible() || !String.valueOf(a.getFallBack()).equals(String.valueOf(b.getFallBack()))
                    || !a.getCapabilities().equals(b.getCapabilities())) {
                return false;
            }
        }
        return true;
    }

    private static Channel copyWithGenericFallBack(Channel channel) {
        Channel copy = new Channel();
        copy.setIdentifier(channel.getIdentifier());
        copy.setVisible(channel.isVisible());
        copy.setCapabilities(channel.getCapabilities());
        copy.setFallBack(Channel.GENERIC_CHANNEL);
        return copy;
    }

    @Override
    public int getPriority() {
        return PRIORITY;
    }

    @Override
    public Map<String, String> getChannelCapabilities(String identifier) {
        Channel channel = snapshot.get().channels.get(identifier);
        return channel != null ? channel.getCapabilities() : null;
    }

    @Override
    public String resolveChannel(HttpServletRequest request) {
        String userAgent = request.getHeader(USER_AGENT_HEADER_NAME);
        if (userAgent != null) {
            if (userAgent.length() > MAX_USER_AGENT_LENGTH) {
                userAgent = userAgent.substring(0, MAX_USER_AGENT_LENGTH);
            }
            for (Map.Entry<Pattern, String> entry : snapshot.get().userAgentChannels.entrySet()) {
                if (entry.getKey().matcher(userAgent).matches()) {
                    return entry.getValue();
                }
            }
        }
        return null;
    }

    @Override
    public List<String> getAllChannels() {
        return Collections.unmodifiableList(new ArrayList<>(snapshot.get().channels.keySet()));
    }

    @Override
    public String getFallBack(String identifier) {
        Channel channel = snapshot.get().channels.get(identifier);
        return channel != null ? channel.getFallBack() : null;
    }

    @Override
    public boolean isVisible(String identifier) {
        Channel channel = snapshot.get().channels.get(identifier);
        return channel != null && channel.isVisible();
    }
}
