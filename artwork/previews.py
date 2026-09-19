"""Regenerates the widget preview mock-ups. Run from artwork/, or via build.sh."""

import re

FONT = 'Helvetica, Arial, sans-serif'
SCALE = 2.28
CARD_W = 380

LIGHT = dict(page='#EFEFF4', card='#FFFFFF', field='#F6F6F8', line='#E6E6EA',
             text='#17171A', muted='#8F8F94', chip='#EBEBEF')
DARK = dict(page='#000000', card='#1C1C1E', field='#2C2C2E', line='#3A3A3C',
            text='#F5F5F7', muted='#8E8E93', chip='#3A3A3C')

WIDGET = '../widgets/range-picker/public/index.html'

def widget_icons():
    """
    Reads the mode glyphs out of the widget itself.

    They were duplicated here once and the preview quietly fell a mode behind when a
    fourth was added. Taking them from the source of truth means it cannot happen again.
    """
    html = open(WIDGET, encoding='utf-8').read()
    icons = dict(re.findall(r'data-mode="(\w+)"><svg[^>]*>(.*?)</svg>', html, re.S))
    cog = re.search(r'id="cog"[^>]*><svg[^>]*>(.*?)</svg>', html, re.S).group(1).strip()

    return icons, cog


ICONS, COG_PATHS = widget_icons()

# The range's four; a Time device cannot follow another device, so it shows three.
MODES = ['absolute', 'sunrise', 'sunset', 'device']
TIME_MODES = ['absolute', 'sunrise', 'sunset']

COG_PATHS = '<circle cx="12" cy="12" r="3.2" /><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />'


def text(x, y, value, size, fill, weight=None, anchor='middle'):
    w = f' font-weight="{weight}"' if weight else ''
    return (f'    <text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}"{w} '
            f'fill="{fill}" text-anchor="{anchor}">{value}</text>')


def chips(cx, y, active, c, width=36, height=26, gap=6, icon=18, modes=None):
    """The mode row, centred on cx, with one chip lit."""
    modes = modes or MODES
    total = len(modes) * width + (len(modes) - 1) * gap
    x = cx - total / 2
    out = []

    for mode in modes:
        lit = mode == active
        if lit:
            out.append(f'    <rect x="{x:g}" y="{y}" width="{width}" height="{height}" '
                       f'rx="6" fill="{c["chip"]}"/>')
        stroke = c['text'] if lit else c['muted']
        scale = icon / 24
        out.append(f'    <g fill="none" stroke="{stroke}" stroke-width="1.8" stroke-linecap="round" '
                   f'stroke-linejoin="round" transform="translate({x + (width - icon) / 2:g} '
                   f'{y + (height - icon) / 2:g}) scale({scale:g})">{ICONS[mode]}</g>')
        x += width + gap

    return out


def stepper(cx, cy, c, r=13):
    """The − and + buttons that shift the offset."""
    return [
        f'    <circle cx="{cx:g}" cy="{cy:g}" r="{r}" fill="{c["chip"]}"/>',
        f'    <g stroke="{c["text"]}" stroke-width="1.8" stroke-linecap="round">'
        f'<path d="M{cx - 5:g} {cy:g}h10"/></g>',
    ]


def plus(cx, cy, c, r=13):
    return [
        f'    <circle cx="{cx:g}" cy="{cy:g}" r="{r}" fill="{c["chip"]}"/>',
        f'    <g stroke="{c["text"]}" stroke-width="1.8" stroke-linecap="round">'
        f'<path d="M{cx - 5:g} {cy:g}h10"/><path d="M{cx:g} {cy - 5:g}v10"/></g>',
    ]


def power(c):
    return ['    <circle cx="354" cy="26" r="15" fill="#2674F0"/>',
            '    <g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"',
            '       transform="translate(346 18)">',
            '      <path d="M8 2.5v5.5"/><path d="M4.4 4.6a5 5 0 1 0 7.2 0"/>',
            '    </g>']


def cog(c, cx=354):
    """The range widget's menu button, top right - the same gear the widget draws."""
    return [f'    <circle cx="{cx}" cy="26" r="15" fill="{c["chip"]}"/>',
            f'    <g fill="none" stroke="{c["text"]}" stroke-width="1.8" stroke-linecap="round" '
            f'stroke-linejoin="round" transform="translate({cx - 8} 18) scale(0.667)">'
            + COG_PATHS + '</g>']


def mixed_toggle(c, cx=26):
    """Top left: the switched devices are half on, so the icon is half filled."""
    return [f'    <circle cx="{cx}" cy="26" r="15" fill="{c["chip"]}"/>',
            f'    <g transform="translate({cx - 8} 18) scale(0.667)">'
            '<circle cx="12" cy="12" r="8" fill="none" stroke="#F5A623" stroke-width="2"/>'
            '<path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="#F5A623"/></g>']


def days(cx, y, c, size=28, gap=4):
    names = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
    total = len(names) * size + (len(names) - 1) * gap
    x = cx - total / 2
    out = []

    for name in names:
        out.append(f'    <rect x="{x:g}" y="{y}" width="{size}" height="22" rx="6" fill="{c["chip"]}"/>')
        out.append(text(x + size / 2, y + 15.5, name, 12.5, c['text']))
        x += size + gap

    return out


def card(height, body, c):
    top = (1024 - height * SCALE) / 2
    left = (1024 - CARD_W * SCALE) / 2

    return '\n'.join([
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">',
        f'  <rect width="1024" height="1024" fill="{c["page"]}"/>',
        f'  <g transform="translate({left:g} {top:.1f}) scale({SCALE})">',
        f'    <rect x="0" y="0" width="{CARD_W}" height="{height}" rx="18" fill="{c["card"]}"/>',
        *body,
        '  </g>',
        '</svg>',
        '',
    ])


def time_preview(c):
    """One time, following the sun."""
    body = [
        *power(c),
        text(190, 31, 'Dusk', 12.5, c['muted']),
        *chips(190, 42, 'sunset', c, modes=TIME_MODES),
        f'    <rect x="16" y="76" width="348" height="52" rx="10" fill="{c["field"]}" stroke="{c["line"]}"/>',
        *stepper(46, 102, c),
        text(190, 113, '19:35', 34, c['text'], weight=700),
        *plus(334, 102, c),
        text(190, 145, 'Sunset +15 min', 12.5, c['muted']),
        *days(190, 156, c),
    ]
    return card(194, body, c)


def range_preview(c):
    """A range whose start follows the sun and whose end does not."""
    body = [
        *mixed_toggle(c),
        *cog(c),
        text(190, 31, 'Evening lamps', 12.5, c['muted']),

        text(101, 54, 'On', 12.5, c['muted']),
        *chips(101, 62, 'device', c, width=26, height=22, gap=3, icon=15),
        f'    <rect x="16" y="92" width="170" height="44" rx="10" fill="{c["field"]}" stroke="{c["line"]}"/>',
        *stepper(38, 114, c, r=11),
        text(101, 123, '19:35', 26, c['text'], weight=700),
        *plus(164, 114, c, r=11),
        text(101, 151, 'Dusk ▾', 11.5, c['muted']),

        text(279, 54, 'Off', 12.5, c['muted']),
        *chips(279, 62, 'absolute', c, width=26, height=22, gap=3, icon=15),
        f'    <rect x="194" y="92" width="170" height="44" rx="10" fill="{c["field"]}" stroke="{c["line"]}"/>',
        text(279, 123, '23:58', 26, c['text'], weight=700),

        *days(190, 162, c),
        text(190, 202, '4 h 23 min', 12.5, c['muted']),
    ]
    return card(218, body, c)


for name, build in [('time', time_preview), ('range', range_preview)]:
    for scheme, colours in [('light', LIGHT), ('dark', DARK)]:
        path = f'preview-{name}-{scheme}.svg'
        open(path, 'w').write(build(colours))
        print('wrote', path)
