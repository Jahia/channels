#!/usr/bin/env python3
"""Generates the shipped devices of the channels module: the device frames (SVG), the device configurations (.cfg)
and the fixture used by the Cypress tests.

Usage, from the root of the repository: python3 tools/generate-devices.py

Geometry, see ChannelPreviewFrameFilter: the frame picture (decorator-images, of size decorator-image-sizes) is the
background of the generated page, and the previewed page is shown in a frame of the size of the screen
(usable-resolutions) placed at decorator-screen-positions in the picture.
"""
import json
import os

BODY = '#22262c'
EDGE = '#3b424b'
DARK = '#0c0e11'
BASE = '#c5cad2'
BASE_EDGE = '#9aa1ab'


def svg(width, height, shapes):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">\n%s\n</svg>\n'
            % (width, height, width, height, '\n'.join('  ' + s for s in shapes)))


def rect(x, y, w, h, fill, rx=0, stroke=None):
    s = '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s"' % (x, y, w, h, rx, fill)
    if stroke:
        s += ' stroke="%s" stroke-width="2"' % stroke
    return s + '/>'


def circle(cx, cy, r, fill):
    return '<circle cx="%g" cy="%g" r="%g" fill="%s"/>' % (cx, cy, r, fill)


def handheld(w, h, portrait, long_bezel, short_bezel, radius):
    """Phone or tablet: the long bezels are at the top and bottom in portrait, on the sides in landscape."""
    sx, sy = (short_bezel, long_bezel) if portrait else (long_bezel, short_bezel)
    iw, ih = w + 2 * sx, h + 2 * sy
    shapes = [rect(1, 1, iw - 2, ih - 2, BODY, radius, EDGE), rect(sx, sy, w, h, '#ffffff')]
    shapes.append(circle(iw / 2, sy / 2, 4, DARK) if portrait else circle(sx / 2, ih / 2, 4, DARK))
    return iw, ih, sx, sy, shapes


def phone(w, h, portrait):
    return handheld(w, h, portrait, 40, 14, 38)


def tablet(w, h, portrait):
    return handheld(w, h, portrait, 30, 26, 30)


def laptop(w, h, portrait):
    side, top, bottom, base_extra, base_h = 14, 24, 14, 80, 20
    lid_w, lid_h = w + 2 * side, top + h + bottom
    iw, ih = lid_w + 2 * base_extra, lid_h + base_h
    sx, sy = base_extra + side, top
    shapes = [
        rect(base_extra + 1, 1, lid_w - 2, lid_h + 8, BODY, 14, EDGE),
        rect(sx, sy, w, h, '#ffffff'),
        circle(iw / 2, top / 2, 3, DARK),
        rect(1, lid_h, iw - 2, base_h - 1, BASE, 10, BASE_EDGE),
        rect(iw / 2 - 70, lid_h, 140, 7, BASE_EDGE, 3),
    ]
    return iw, ih, sx, sy, shapes


def desktop(w, h, portrait):
    side, top, chin, neck_w, neck_h, foot_w, foot_h = 14, 14, 30, 150, 64, 380, 14
    iw, ih = w + 2 * side, top + h + chin + neck_h + foot_h
    panel_h = top + h + chin
    sx, sy = side, top
    shapes = [
        rect(iw / 2 - neck_w / 2, panel_h - 6, neck_w, neck_h + 6, BASE, 0, BASE_EDGE),
        rect(iw / 2 - foot_w / 2, panel_h + neck_h, foot_w, foot_h - 1, BASE, 6, BASE_EDGE),
        rect(1, 1, iw - 2, panel_h - 2, BODY, 10, EDGE),
        rect(sx, sy, w, h, '#ffffff'),
        circle(iw / 2, top + h + chin / 2, 3, EDGE),
    ]
    return iw, ih, sx, sy, shapes


# identifier, display name, frame, (width, height) in portrait or of the only variant, variants
VIEWPORTS = [
    ('viewport_0320', 'Mobile 320 (WCAG)', phone, (320, 568), ('portrait', 'landscape')),
    ('viewport_0360', 'Mobile 360', phone, (360, 800), ('portrait', 'landscape')),
    ('viewport_0414', 'Mobile 414', phone, (414, 896), ('portrait', 'landscape')),
    ('viewport_0768', 'Tablet 768', tablet, (768, 1024), ('portrait', 'landscape')),
    ('viewport_1024', 'Tablet 1024', tablet, (768, 1024), ('landscape', 'portrait')),
    ('viewport_1280', 'Laptop 1280', laptop, (1280, 720), ('landscape',)),
    ('viewport_1536', 'Desktop 1536', desktop, (1536, 864), ('landscape',)),
    ('viewport_1920', 'Desktop 1920', desktop, (1920, 1080), ('landscape',)),
]

# identifier, display name, frame, size, variants, keys and capabilities (in the order of the configuration file)
USER_AGENT_DEVICES = [
    ('apple_iphone_ver1', 'Phone: iPhone', phone, (390, 844), ('portrait', 'landscape'),
     [('fallBack', 'generic_mobile')], [('template-type-mapping', 'iphone'), ('userAgentPattern', '.*iPhone.*')]),
    ('generic_android', 'Phone: Android', phone, (360, 800), ('portrait', 'landscape'),
     [('fallBack', 'generic_mobile')],
     [('template-type-mapping', 'android'), ('userAgentPattern', '.*Android.*Mobile.*')]),
    ('apple_ipad_ver1', 'Tablet: iPad', tablet, (768, 1024), ('portrait', 'landscape'),
     [('fallBack', 'generic')], [('template-type-mapping', 'ipad'), ('userAgentPattern', '.*iPad.*')]),
    ('android_tablet', 'Tablet: Android', tablet, (768, 1024), ('portrait', 'landscape'),
     [('fallBack', 'generic')],
     [('template-type-mapping', 'tablet'), ('userAgentPattern', '.*Android(?!.*Mobile).*')]),
]

PREFIX = 'org.jahia.community.modules.channels.device-'

# First line of a configuration file that Jahia installs once and then leaves to the administrator. Without it, Jahia
# would overwrite the file each time the module starts.
DEFAULT_CONFIGURATION = '# Default configuration: it can be changed, see README.md'


def main():
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cfg_dir = os.path.join(repo, 'src/main/resources/META-INF/configurations')
    img_dir = os.path.join(repo, 'src/main/resources/images/frames')
    os.makedirs(img_dir, exist_ok=True)
    fixture = []

    def build(identifier, name, frame, size, variants, comment, keys, capabilities, user_agent):
        images, image_sizes, positions, resolutions, fixture_variants = [], [], [], [], []
        for variant in variants:
            portrait = variant == 'portrait'
            w, h = size if (portrait or len(variants) == 1) else (size[1], size[0])
            iw, ih, sx, sy, shapes = frame(w, h, portrait)
            file_name = '%s-%s.svg' % (identifier, variant)
            with open(os.path.join(img_dir, file_name), 'w') as f:
                f.write(svg(iw, ih, shapes))
            images.append('/modules/channels/images/frames/' + file_name)
            image_sizes.append('%dx%d' % (iw, ih))
            positions.append('%dx%d' % (sx, sy))
            resolutions.append('%dx%d' % (w, h))
            fixture_variants.append({'name': variant, 'width': w, 'height': h, 'frameWidth': iw, 'frameHeight': ih,
                                     'screenX': sx, 'screenY': sy})
        lines = [DEFAULT_CONFIGURATION, comment,
                 '# Generated by tools/generate-devices.py. See README.md for the supported keys.',
                 'identifier = ' + identifier]
        lines += ['%s = %s' % kv for kv in keys]
        lines.append('capability.display-name = ' + name)
        lines += ['capability.%s = %s' % kv for kv in capabilities]
        lines.append('capability.variants = ' + ','.join(variants))
        lines.append('capability.variants-displayNames = ' + ','.join(v.capitalize() for v in variants))
        lines.append('capability.usable-resolutions = ' + ','.join(resolutions))
        lines.append('capability.decorator-images = ' + ','.join(images))
        lines.append('capability.decorator-image-sizes = ' + ','.join(image_sizes))
        lines.append('capability.decorator-screen-positions = ' + ','.join(positions))
        if frame in (phone, tablet):
            # scrollbars take no room on these devices
            lines.append('capability.overlay-scrollbars = true')
        with open(os.path.join(cfg_dir, PREFIX + identifier + '.cfg'), 'w') as f:
            f.write('\n'.join(lines) + '\n')
        fixture.append({'name': identifier, 'displayName': name, 'userAgent': user_agent,
                        'overlayScrollbars': frame in (phone, tablet), 'variants': fixture_variants})

    for identifier, name, frame, size, variants in VIEWPORTS:
        build(identifier, name, frame, size, variants,
              '# Preview-only viewport: no userAgentPattern, so it is never resolved from a request.', [], [], False)
    for identifier, name, frame, size, variants, keys, capabilities in USER_AGENT_DEVICES:
        build(identifier, name, frame, size, variants,
              '# Device resolved from the User-Agent header.', keys, capabilities, True)

    # the fallback of the two phones: no pattern, no frame, not offered in the preview
    with open(os.path.join(cfg_dir, PREFIX + 'generic_mobile.cfg'), 'w') as f:
        f.write('\n'.join([
            DEFAULT_CONFIGURATION,
            '# Fallback of the phones. Never resolved from a request, and hidden in the preview device selector.',
            '# Generated by tools/generate-devices.py. See README.md for the supported keys.',
            'identifier = generic_mobile',
            'visible = false',
            'fallBack = generic',
            'capability.display-name = Generic Phone',
            'capability.template-type-mapping = mobile',
        ]) + '\n')

    with open(os.path.join(repo, 'tests/cypress/fixtures/devices.json'), 'w') as f:
        json.dump(fixture, f, indent=2)
        f.write('\n')
    print('%d devices, %d frames' % (len(fixture), sum(len(d['variants']) for d in fixture)))


if __name__ == '__main__':
    main()
