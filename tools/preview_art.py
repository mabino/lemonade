#!/usr/bin/env python3
"""Render src/lemonade_art.js to an HTML page (VGA colours, CP437 glyphs) for
eyeballing the art without a BBS.

  python3 tools/preview_art.py art-preview.html
"""
import html
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "..", "src", "lemonade_art.js")
VGA = ["#000000", "#aa0000", "#00aa00", "#aa5500", "#0000aa", "#aa00aa", "#00aaaa", "#aaaaaa",
       "#555555", "#ff5555", "#55ff55", "#ffff55", "#5555ff", "#ff55ff", "#55ffff", "#ffffff"]
LETTERS = "krgybmcw"

pieces = json.loads(subprocess.check_output(
    ["node", "-e", f"process.stdout.write(JSON.stringify(require({json.dumps(ART)})))"]))


def row_html(line):
    fg, bg, bright, out, i = 7, 0, False, [], 0
    while i < len(line):
        ch = line[i]
        if ch == "\x01" and i + 1 < len(line):
            code = line[i + 1]
            i += 2
            if code == "n":
                fg, bg, bright = 7, 0, False
            elif code == "h":
                bright = True
            elif code in LETTERS:
                fg = LETTERS.index(code)
            elif code.isdigit():
                bg = int(code)
            continue
        f = fg + (8 if bright and fg < 8 else 0)
        glyph = bytes([ord(ch)]).decode("cp437")
        out.append(f'<span style="color:{VGA[f]};background:{VGA[bg]}">{html.escape(glyph)}</span>')
        i += 1
    return "".join(out)


parts = []
for name, p in pieces.items():
    rows = "\n".join(row_html(l) for l in p["lines"])
    parts.append(f"<h3>{name} ({p['width']}x{p['height']})</h3><pre>{rows}</pre>")
page = ("<!doctype html><meta charset=utf-8><title>Lemonade art</title>"
        "<style>body{background:#222;color:#ccc;font-family:sans-serif;margin:16px}"
        "pre{font:16px/1 'Courier New',monospace;background:#000;display:inline-block;padding:4px;margin:0 0 8px}"
        "h3{margin:12px 0 4px;font-size:13px}</style>" + "".join(parts))
open(sys.argv[1] if len(sys.argv) > 1 else "art-preview.html", "w", encoding="utf-8").write(page)
