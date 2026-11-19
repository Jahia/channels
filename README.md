<a href="https://www.jahia.com/">
    <img src="https://www.jahia.com/modules/jahiacom-templates/images/jahia-3x.png" alt="Jahia logo" title="Jahia" align="right" height="60" />
</a>

Channels
======================
Jahia module that detects and display different content depending on the channel.

## What the module does

- It declares a list of channels (devices). These feed the "Devices" selector of the jContent customized preview.
- It resolves the channel of each request from its `User-Agent` header, in live as well. The resolved channel is
  part of the HTML cache key, so fragments are cached per channel.
- It provides the `jmix:channelSelection` mixin and a render filter, to include or exclude a content item for some
  channels. Up to jContent 3.6, Content Editor offers this option in the visibility of a content item. Since
  jContent 3.7.0 it no longer does: the mixin still works, but has to be set by other means.
- In the preview, it shows the page inside the frame of the selected device, at the size of its screen.

## Requirements

Jahia 8.2.0.0 or later.

## Shipped devices

The module ships two kinds of devices in `META-INF/configurations`. Both are offered in the device selector of the
jContent customized preview, where the page is shown at the size of the screen of the device, inside a generic
device frame.

Viewports. They declare no `userAgentPattern`: they are never resolved from a request, so they have no effect in
live.

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
(576, 768, 992, 1200 pixels).

Devices resolved from the `User-Agent` header. They resolve the channel of each request, in live as well. Only
the first 1024 characters of the header are used.

| Identifier | Display name | `userAgentPattern` | Screen sizes |
| --- | --- | --- | --- |
| `apple_iphone_ver1` | Phone: iPhone | `.*iPhone.*` | 390x844, 844x390 |
| `generic_android` | Phone: Android | `.*Android.*Mobile.*` | 360x800, 800x360 |
| `apple_ipad_ver1` | Tablet: iPad | `.*iPad.*` | 768x1024, 1024x768 |
| `android_tablet` | Tablet: Android | `.*Android(?!.*Mobile).*` | 768x1024, 1024x768 |
| `generic_mobile` | Generic Phone | none, hidden fallback of the two phones | |

Since iPadOS 13, Safari on iPad sends the `User-Agent` of a Mac by default, so `apple_ipad_ver1` is not resolved
for it.

Where Content Editor offers the channel visibility option, it lists all the channels, viewports included. A
viewport never matches a live request: a content item restricted to a viewport is only affected in the preview of
that viewport.

## Declaring devices

Each device is an OSGi factory configuration, with the factory PID `org.jahia.community.modules.channels.device`.

To add a device, create a file named `org.jahia.community.modules.channels.device-<name>.cfg` in
`digital-factory-data/karaf/etc`. Changes are applied without restarting the module.

The shipped devices are installed in `karaf/etc` the first time the module starts, and can then be changed there:

- to hide a device in the preview selector, set `visible = false`;
- to stop resolving a device from the `User-Agent` header, remove its `capability.userAgentPattern`;
- a shipped configuration that is deleted is installed again, as shipped, the next time the module starts. This is
  also how to get the configuration of a new version of the module: an update of the module does not replace the
  configurations that are already installed.

The identifier `generic` is the channel declared by Jahia: a device cannot use it. When two configurations declare
the same identifier, one of them is used and a warning is logged.

| Key | Mandatory | Description |
| --- | --- | --- |
| `identifier` | yes | Identifier of the channel. The preview selector lists the devices in the alphabetical order of their identifier. |
| `fallBack` | no | Identifier of the fallback channel. Defaults to `generic`. A device that falls back to itself, directly or through other devices, falls back to `generic` instead. |
| `visible` | no | `true` or `false`. `false` hides the channel in the preview selector. Defaults to `true`. |
| `capability.<name>` | no | A capability of the channel, see below. |

Capabilities used by Jahia and jContent:

| Capability | Description |
| --- | --- |
| `display-name` | Label of the device. |
| `userAgentPattern` | Regular expression that the `User-Agent` header, cut to 1024 characters, has to match entirely. A device without it is never resolved from a request: it is only available in the preview. |
| `template-type-mapping` | Template type used to look for device-specific views. |
| `variants`, `variants-displayNames` | Comma-separated variants of the device and their labels, for example `portrait,landscape`. |
| `usable-resolutions` | Comma-separated `<width>x<height>`, one per variant: the size of the screen. |
| `decorator-images` | Comma-separated paths of the frame pictures, one per variant. Letters, digits, `_`, `-`, `.` and `/` only. |
| `decorator-image-sizes` | Comma-separated `<width>x<height>`, one per variant: the size of the frame picture. Without a frame, jContent uses it as the size of the preview. |
| `decorator-screen-positions` | Comma-separated `<x>x<y>`, one per variant: the position of the screen in the frame picture. |
| `overlay-scrollbars` | `true` for a device whose scrollbars take no room, such as a phone or a tablet: the scrollbar of the previewed page is hidden, so that the page is as wide as the screen. |

When several devices declare a `userAgentPattern`, they are evaluated in the alphabetical order of their identifier,
and the first match wins.

### Device frames

The module draws the frame when a device declares `variants`, `usable-resolutions`, `decorator-images`,
`decorator-image-sizes` and `decorator-screen-positions` together. The preview is then a page of the size of the
frame picture, with the previewed page shown at `decorator-screen-positions`, at the size given by
`usable-resolutions`.

The `variant` parameter of a preview has to be one of the declared variants; without it, the first one is used.
The scrollbar is hidden by a script:
if a content security policy blocks it, the scrollbar stays visible.

A device without frame only needs `variants` and `decorator-image-sizes`, which is then the size of the preview:

```properties
identifier = viewport_1440
capability.display-name = Desktop 1440
capability.variants = landscape
capability.variants-displayNames = Landscape
capability.decorator-image-sizes = 1440x900
```

The shipped configurations and their frame pictures (`images/frames`) are generated by
`tools/generate-devices.py`. To change the shipped list, edit the tables `VIEWPORTS` and `USER_AGENT_DEVICES` of
this script and run it.

## Open-Source

Channels is an Open-Source module, you can find more details about Open-Source @ Jahia [in this repository](https://github.com/Jahia/open-source).
