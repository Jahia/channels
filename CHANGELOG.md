# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Devices are declared by OSGi configuration, one file per device, and can be changed without restarting the module.
- Eight preview-only viewports, from 320 to 1920 pixels wide, for the jContent customized preview.
- Generic device frames (phone, tablet, laptop, monitor) for the preview, drawn by the module.

### Changed

- The module requires Jahia 8.2.0.0 or later, and no longer uses Spring.
- Screen sizes in the preview: 390x844 for the iPhone and 360x800 for the Android phone.
- The preview of a device only accepts the variants that the device declares.
- A cookie or a `channel` parameter only selects a declared channel.

### Removed

- The channel tabs of the legacy GWT edit and studio modes.
- The device photographs, and the capabilities `device-image`, `resolution_width`, `resolution_height` and
  `full_flash_support`.
