<a href="https://www.jahia.com/">
    <img src="https://www.jahia.com/modules/jahiacom-templates/images/jahia-3x.png" alt="Jahia logo" title="Jahia" align="right" height="60" />
</a>

Channels
======================
Jahia module that declares devices (channels), to preview a page on a device and to show different content
depending on the device of the visitor.

## What the module does

- **Preview on a device.** In the jContent customized preview, the "Devices" selector lists the devices of the
  module. The page is shown at the size of the screen of the selected device, inside a generic device frame.
- **Channel of a request.** The module resolves the channel of each request from its `User-Agent` header, in live
  as well. The HTML cache keeps a version of a page for each channel.
- **Content for some channels only.** The `jmix:channelSelection` mixin includes or excludes a content item for the
  channels it lists.

Without the module, Jahia only knows the `generic` channel, and jContent hides the "Devices" selector.

## Requirements

Jahia 8.2.0.0 or later.

## Shipped devices

The module ships two kinds of devices. Both are offered in the "Devices" selector.

### Viewports

A viewport is a screen size to check a page at. It is never resolved from a request, so it has no effect in live.

| Identifier | Display name | Screen sizes | Frame |
| --- | --- | --- | --- |
| `viewport_0320` | Mobile 320 (WCAG) | 320x568, 568x320 | phone |
| `viewport_0360` | Mobile 360 | 360x800, 800x360 | phone |
| `viewport_0414` | Mobile 414 | 414x896, 896x414 | phone |
| `viewport_0768` | Tablet 768 | 768x1024, 1024x768 | tablet |
| `viewport_1024` | Tablet 1024 | 1024x768, 768x1024 | tablet |
| `viewport_1280` | Laptop 1280 | 1280x720 | laptop |
| `viewport_1536` | Desktop 1536 | 1536x864 | monitor |
| `viewport_1920` | Desktop 1920 | 1920x1080 | monitor |

320 pixels is the width at which WCAG 2.2 success criterion 1.4.10 (Reflow) requires content to remain usable
without horizontal scrolling. The other sizes are common screen sizes on each side of the usual CSS breakpoints
(576, 768, 992 and 1200 pixels).

### Devices resolved from the User-Agent header

A request whose `User-Agent` header matches the pattern of a device gets the channel of that device.

| Identifier | Display name | `userAgentPattern` | Screen sizes |
| --- | --- | --- | --- |
| `apple_iphone_ver1` | Phone: iPhone | `.*iPhone.*` | 390x844, 844x390 |
| `generic_android` | Phone: Android | `.*Android.*Mobile.*` | 360x800, 800x360 |
| `apple_ipad_ver1` | Tablet: iPad | `.*iPad.*` | 768x1024, 1024x768 |
| `android_tablet` | Tablet: Android | `.*Android(?!.*Mobile).*` | 768x1024, 1024x768 |
| `generic_mobile` | Generic Phone | none | none |

`generic_mobile` is the fallback of the two phones: a content item restricted to it applies to both. It is hidden
in the selector.

Since iPadOS 13, Safari on iPad sends the `User-Agent` of a Mac by default, so `apple_ipad_ver1` is not resolved
for it.

## Showing content for some channels only

Add the `jmix:channelSelection` mixin to a content item:

| Property | Description |
| --- | --- |
| `j:channelSelection` | The identifiers of the channels. |
| `j:channelIncludeOrExclude` | `exclude` (the default) hides the content for these channels. `include` shows it for these channels only. |

A channel also matches the channel it falls back to: the iPhone matches `generic_mobile`.

Up to jContent 3.6, Content Editor offers this option in the visibility of a content item. Since jContent 3.7.0 it
no longer does: the mixin still works, but has to be set by other means. Where the option is offered, it lists all
the channels, viewports included. A viewport never matches a live request, so a content item restricted to a
viewport is only affected in the preview of that viewport.

## Configuring devices

Each device is an OSGi factory configuration, with the factory PID `org.jahia.community.modules.channels.device`.
Changes are applied without restarting the module.

### Changing a shipped device

The shipped devices are installed in `digital-factory-data/karaf/etc` the first time the module starts. Edit them
there, or in the OSGi configuration tools:

- to hide a device in the selector, set `visible = false`;
- to stop resolving a device from the `User-Agent` header, remove its `capability.userAgentPattern`.

A shipped configuration that is deleted is installed again, as shipped, the next time the module starts. An update
of the module does not replace the configurations that are already installed: delete one to get its new version.

### Adding a device

Create a file named `org.jahia.community.modules.channels.device-<name>.cfg` in `digital-factory-data/karaf/etc`.
For a screen size without frame:

```properties
identifier = viewport_1440
capability.display-name = Desktop 1440
capability.variants = landscape
capability.variants-displayNames = Landscape
capability.decorator-image-sizes = 1440x900
```

### Keys

| Key | Mandatory | Description |
| --- | --- | --- |
| `identifier` | yes | Identifier of the channel. The selector lists the devices in the alphabetical order of their identifier. `generic` is the channel declared by Jahia: a device cannot use it. |
| `fallBack` | no | Identifier of the fallback channel. Defaults to `generic`. A device that falls back to itself, directly or through other devices, falls back to `generic` instead. |
| `visible` | no | `true` or `false`. `false` hides the channel in the selector. Defaults to `true`. |
| `capability.<name>` | no | A capability of the channel, see below. |

When two configurations declare the same identifier, one of them is used and a warning is logged.

### Capabilities

| Capability | Description |
| --- | --- |
| `display-name` | Label of the device. |
| `userAgentPattern` | Regular expression that the first 1024 characters of the `User-Agent` header have to match entirely. A device without it is never resolved from a request. |
| `template-type-mapping` | Template type used to look for device-specific views. |
| `variants`, `variants-displayNames` | Comma-separated variants of the device and their labels, for example `portrait,landscape`. |
| `usable-resolutions` | Comma-separated `<width>x<height>`, one per variant: the size of the screen. |
| `decorator-images` | Comma-separated paths of the frame pictures, one per variant. Letters, digits, `_`, `-`, `.` and `/` only. |
| `decorator-image-sizes` | Comma-separated `<width>x<height>`, one per variant: the size of the frame picture. Without a frame, the size of the preview. |
| `decorator-screen-positions` | Comma-separated `<x>x<y>`, one per variant: the position of the screen in the frame picture. |
| `overlay-scrollbars` | `true` for a device whose scrollbars take no room, such as a phone or a tablet. The scrollbar of the previewed page is then hidden, so that the page is as wide as the screen. |

When several devices declare a `userAgentPattern`, they are evaluated in the alphabetical order of their identifier,
and the first match wins.

### Device frames

A device has a frame when it declares `variants`, `usable-resolutions`, `decorator-images`,
`decorator-image-sizes` and `decorator-screen-positions` together. The preview is then a page of the size of the
frame picture, which shows the previewed page at `decorator-screen-positions`, at the size given by
`usable-resolutions`.

The `variant` parameter of a preview has to be one of the declared variants. Without it, the first one is used.

The scrollbar of a device with `overlay-scrollbars` is hidden by a script. If a content security policy blocks
this script, the scrollbar stays visible.

## Selecting a channel for a request

The channel of a request comes from, in this order:

1. the cookie `org.jahia.channels.activeChannel`;
2. the `channel` request parameter, outside of the live workspace;
3. the `User-Agent` header.

A cookie only selects a declared channel. A `channel` parameter that names no declared channel means the `generic`
channel.

## Development

The shipped configurations (`src/main/resources/META-INF/configurations`) and their frame pictures
(`src/main/resources/images/frames`) are generated. To change the shipped list, edit the tables `VIEWPORTS` and
`USER_AGENT_DEVICES` of `tools/generate-devices.py`, then run:

```bash
python3 tools/generate-devices.py
```

The end-to-end tests are described in [tests/README.md](tests/README.md).

## Open-Source

Channels is an Open-Source module, you can find more details about Open-Source @ Jahia [in this repository](https://github.com/Jahia/open-source).
