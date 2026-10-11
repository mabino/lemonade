#!/usr/bin/env python3
"""Draw Lemonade Stand's ANSI art and write it as src/lemonade_art.js.

  python3 tools/make_art.py            write src/lemonade_art.js
  python3 tools/make_art.py --check    exit 1 if src/lemonade_art.js is stale

Everything is half-block pixel art drawn in code (two square pixels per text
cell), starring green bean characters. Pieces are encoded with Synchronet
Ctrl-A colour codes, one string per text row, so the door can print them or
place them with console.gotoxy(). No dependencies.

Pieces: splash, weather_sun / weather_partly / weather_rain, day_sales /
day_rain / day_loss, news_sugar / news_lemons / news_cups, season_end,
season_bust, trophy.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "lemonade_art.js")

T = -1                                      # transparent (shows as black)
BLACK, RED, GREEN, BROWN, BLUE, MAGENTA, CYAN, GREY = range(8)
DGREY, LRED, LGREEN, YELLOW, LBLUE, LMAGENTA, LCYAN, WHITE = range(8, 16)


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h + (h % 2)
        self.g = [[T] * self.w for _ in range(self.h)]

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, c)

    def disc(self, cx, cy, r, c):
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r:
                    self.px(x, y, c)

    def oval(self, cx, cy, rx, ry, c):
        for y in range(cy - ry, cy + ry + 1):
            for x in range(cx - rx, cx + rx + 1):
                if ((x - cx) / (rx + 0.5)) ** 2 + ((y - cy) / (ry + 0.5)) ** 2 <= 1:
                    self.px(x, y, c)

    def sprite(self, rows, x0, y0, key=None):
        key = key or SPRITE_KEY
        for dy, line in enumerate(rows):
            for dx, ch in enumerate(line):
                if ch in key:
                    self.px(x0 + dx, y0 + dy, key[ch])

    def text(self, s, x, y, c, font=None):
        font = font or FONT
        for ch in s:
            glyph = font[ch]
            for r, line in enumerate(glyph):
                for col, bit in enumerate(line):
                    if bit == "#":
                        self.px(x + col, y + r, c)
            x += len(glyph[0]) + 1
        return x

    # --- encoding ----------------------------------------------------------
    def encode(self):
        """Ctrl-A coded rows. Bright colours can't be backgrounds (0-7), so
        where both halves of a cell are bright the lower one is dimmed."""
        rows = []
        for y in range(0, self.h, 2):
            cells = [cell(self.g[y][x], self.g[y + 1][x]) for x in range(self.w)]
            while cells and cells[-1] == (0x20, 7, 0):
                cells.pop()
            out, state = "", None
            for ch, fg, bg in cells:
                want = (fg if ch != 0x20 else None, bg)
                if ch == 0x20 and state and state[1] == bg:
                    want = state
                if want != state:
                    f = want[0] if want[0] is not None else 7
                    out += "\x01n" + ("\x01h" if f > 7 else "") + "\x01" + "krgybmcw"[f % 8]
                    if bg:
                        out += "\x01" + str(bg)
                    state = want
                out += chr(ch)
            rows.append(out + "\x01n")
        return rows


def cell(top, bot):
    top = BLACK if top == T else top
    bot = BLACK if bot == T else bot
    if top == bot:
        return (0x20, 7, top) if top < 8 else (0xDB, top, 0)
    if bot < 8:
        return (0xDF, top, bot)              # upper half block
    if top < 8:
        return (0xDC, bot, top)              # lower half block
    return (0xDF, top, bot - 8)


SPRITE_KEY = {"G": LGREEN, "g": GREEN, "K": BLACK, "W": WHITE, "R": RED, "P": LRED,
              "C": LCYAN, "Y": YELLOW, "y": BROWN}

# --- bean characters (the site's mascot) ------------------------------------------
POD = [                         # 9 x 15, stem on top, rounded bottom so it stands
    "....g....",
    "...gGG...",
    "..gGGGG..",
    ".gGGGGGG.",
    "gGGGGGGGG",
    "gGGGGGGGG",
    "gGGGGGGGG",
    "gGGGGGGGG",
    "gGGGGGGGG",
    "gGGGGGGGG",
    "gGGGGGGGG",
    "gGGGGGGGG",
    ".gGGGGGGG",
    "..gGGGGG.",
    "...gggg..",
]


def bean(face):
    rows = [list(r) for r in POD]
    for (c, r), k in face.items():
        rows[r][c] = k
    return ["".join(r) for r in rows]


def eye(x, y, pupil):
    f = {(x + i, y + j): "W" for i in range(3) for j in range(3)}
    for dx, dy in pupil:
        f[(x + dx, y + dy)] = "K"
    return f


def face(*parts):
    f = {}
    for p in parts:
        f.update(p)
    return f


EXCITED = face(eye(1, 5, [(1, 2)]), eye(5, 5, [(1, 2)]),
               {(1, 4): "K", (2, 3): "K", (3, 3): "K", (5, 3): "K", (6, 3): "K", (7, 4): "K"},
               {(x, 9): "K" for x in range(2, 7)},
               {(2, 10): "K", (3, 10): "R", (4, 10): "R", (5, 10): "R", (6, 10): "K"},
               {(3, 11): "K", (4, 11): "K", (5, 11): "K"})
WHOA = face(eye(1, 5, [(1, 1)]), eye(5, 5, [(1, 1)]),
            {(x, 3): "K" for x in (1, 2, 3, 5, 6, 7)},
            {(3, 9): "K", (4, 9): "K", (5, 9): "K", (3, 10): "K", (4, 10): "R", (5, 10): "K",
             (3, 11): "K", (4, 11): "K", (5, 11): "K"})
BLISS = {(1, 7): "K", (2, 6): "K", (3, 7): "K", (5, 7): "K", (6, 6): "K", (7, 7): "K",
         (1, 9): "P", (7, 9): "P",
         (2, 9): "K", (6, 9): "K", (3, 10): "K", (4, 10): "K", (5, 10): "K"}
# Sad: brows tilted up in the middle, eyes looking down, a frown, a tear.
SAD = face(eye(1, 5, [(1, 2)]), eye(5, 5, [(1, 2)]),
           {(1, 4): "K", (2, 4): "K", (3, 3): "K", (5, 3): "K", (6, 4): "K", (7, 4): "K"},
           {(3, 10): "K", (4, 10): "K", (5, 10): "K", (2, 11): "K", (6, 11): "K"},
           {(1, 8): "C", (1, 9): "C"})
# Glum: half-closed eyes, flat mouth.
GLUM = face({(x, 5): "K" for x in (1, 2, 3, 5, 6, 7)},
            {(1, 6): "W", (2, 6): "K", (3, 6): "W", (5, 6): "W", (6, 6): "K", (7, 6): "W"},
            {(x, 10): "K" for x in range(3, 7)})

# --- tiny pixel font (3 x 5) ---------------------------------------------------------
FONT = {
    "A": [".#.", "#.#", "###", "#.#", "#.#"], "C": ["###", "#..", "#..", "#..", "###"],
    "D": ["##.", "#.#", "#.#", "#.#", "##."], "E": ["###", "#..", "##.", "#..", "###"],
    "L": ["#..", "#..", "#..", "#..", "###"], "M": ["#.#", "###", "###", "#.#", "#.#"],
    "N": ["#.#", "###", "###", "###", "#.#"], "O": ["###", "#.#", "#.#", "#.#", "###"],
    "S": ["###", "#..", "###", "..#", "###"], "U": ["#.#", "#.#", "#.#", "#.#", "###"],
    "G": ["###", "#..", "#.#", "#.#", "###"], "R": ["##.", "#.#", "##.", "#.#", "#.#"],
    "5": ["###", "#..", "###", "..#", "##."], "1": [".#.", "##.", ".#.", ".#.", "###"],
    "$": [".#.", "###", "##.", ".##", "###"], "c": ["...", ".##", "#..", ".##", "..."],
    " ": ["..", "..", "..", "..", ".."],
}


# --- pieces ------------------------------------------------------------------------------
def lemon(c, cx, cy):
    c.oval(cx, cy, 2, 1, YELLOW)
    c.px(cx + 3, cy, YELLOW)
    c.px(cx - 1, cy - 1, WHITE)                                  # shine


def splash():
    c = Canvas(64, 36)
    # sun with rays
    c.disc(56, 7, 4, YELLOW)
    for dx, dy in ((0, -7), (0, 7), (-7, 0), (7, 0), (-5, -5), (5, 5), (5, -5), (-5, 5)):
        c.px(56 + dx, 7 + dy, YELLOW)
    # striped awning with a scalloped edge
    for x in range(4, 47):
        stripe = YELLOW if (x // 4) % 2 == 0 else WHITE
        for y in range(4, 10):
            c.px(x, y, stripe)
        if (x // 2) % 2 == 0:
            c.px(x, 10, stripe)
    # posts
    c.rect(6, 11, 7, 31, BROWN)
    c.rect(43, 11, 44, 31, BROWN)
    # the bean behind the counter, delighted
    c.sprite(bean(EXCITED), 11, 9)
    # pitcher and a glass on the counter
    c.rect(30, 14, 35, 20, WHITE)
    c.rect(31, 16, 34, 20, YELLOW)
    c.px(36, 15, WHITE); c.px(37, 16, WHITE); c.px(37, 17, WHITE); c.px(36, 18, WHITE)
    c.rect(39, 17, 41, 20, WHITE)
    c.rect(40, 18, 40, 20, YELLOW)
    lemon(c, 26, 19)
    lemon(c, 22, 19)
    # counter, with the sign on its front
    c.rect(4, 21, 46, 21, YELLOW)                            # sunlit top edge
    c.rect(4, 22, 46, 32, BROWN)
    c.rect(8, 24, 42, 30, RED)
    c.text("LEMONADE", 10, 25, WHITE)
    # grass
    c.rect(0, 33, 63, 35, GREEN)
    for x in range(1, 64, 3):
        c.px(x, 32, LGREEN)
    return c


def weather(kind):
    c = Canvas(18, 10)
    if kind in ("sun", "partly"):
        cx, cy = (8, 4) if kind == "sun" else (5, 3)
        c.disc(cx, cy, 3, YELLOW)
        for dx, dy in ((0, -5), (0, 5), (-5, 0), (5, 0), (-4, -4), (4, 4), (4, -4), (-4, 4)):
            c.px(cx + dx, cy + dy, YELLOW)
    if kind in ("partly", "rain"):
        col = WHITE if kind == "partly" else GREY
        c.disc(9, 5, 3, col)
        c.disc(13, 6, 2, col)
        c.disc(6, 6, 2, col)
        c.rect(6, 6, 14, 8, col)
    if kind == "rain":
        for x, y in ((6, 9), (9, 9), (12, 9), (15, 9)):
            c.px(x, y, LCYAN)
            c.px(x - 1, y + 1, LBLUE)
    return c


def day_sales():
    c = Canvas(26, 18)
    c.sprite(bean(BLISS), 2, 2)
    # two stacks of coins: gold faces with darker edges
    for x0, top in ((14, 7), (20, 10)):
        for y in range(top, 17):
            c.rect(x0, y, x0 + 4, y, YELLOW if (y - top) % 2 == 0 else BROWN)
        c.rect(x0 + 1, top - 1, x0 + 3, top - 1, YELLOW)
    c.text("$", 15, 0, YELLOW)
    c.text("$", 21, 3, YELLOW)
    return c


def day_rain():
    c = Canvas(26, 22)
    # a dark cloud and rain
    c.disc(9, 2, 2, DGREY); c.disc(13, 1, 3, DGREY); c.disc(18, 2, 2, DGREY)
    c.rect(7, 2, 20, 3, DGREY)
    for x, y in ((3, 6), (22, 6), (24, 11), (2, 13), (23, 17), (4, 19), (7, 5), (19, 5)):
        c.px(x, y, LCYAN); c.px(x, y + 1, LBLUE)
    # a sad bean under a red umbrella
    c.oval(13, 7, 7, 2, RED)
    c.rect(6, 8, 20, 8, T)
    for x in range(6, 21, 3):
        c.px(x, 8, RED)
    c.sprite(bean(SAD), 9, 7)
    c.rect(18, 8, 18, 15, BROWN)                     # the handle, beside the bean
    c.px(17, 15, BROWN)
    return c


def day_loss():
    c = Canvas(26, 18)
    c.sprite(bean(GLUM), 3, 2)
    # an empty glass
    c.rect(16, 9, 20, 16, WHITE)
    c.rect(17, 10, 19, 15, T)
    c.rect(17, 15, 19, 15, YELLOW)
    return c


def news(item):
    c = Canvas(44, 20)
    c.sprite(bean(WHOA), 2, 3)
    # big red up arrow
    for i in range(6):
        c.rect(17 - i, 3 + i, 17 + i, 3 + i, LRED)
    c.rect(15, 9, 19, 17, LRED)
    if item == "sugar":
        c.rect(23, 6, 43, 17, WHITE)
        c.rect(25, 4, 41, 5, WHITE)
        c.text("SUGAR", 24, 10, BLUE)
    elif item == "lemons":
        c.oval(29, 9, 4, 3, YELLOW); c.px(34, 9, YELLOW); c.px(27, 7, WHITE)
        c.oval(32, 15, 4, 3, YELLOW); c.px(37, 15, YELLOW); c.px(30, 13, WHITE)
        c.rect(29, 5, 30, 5, GREEN)
    else:  # cups
        for k, x in enumerate((25, 31)):
            c.rect(x, 8, x + 4, 17, WHITE)
            c.rect(x - 1, 7, x + 5, 7, WHITE)
            c.rect(x + 1, 11, x + 3, 13, RED)
    return c


def season_end():
    c = Canvas(40, 22)
    for x, y, col in ((2, 2, YELLOW), (8, 0, LRED), (30, 1, LGREEN), (36, 4, YELLOW), (24, 0, WHITE),
                      (14, 3, LCYAN), (38, 10, LRED), (1, 9, LGREEN)):
        c.px(x, y, col)
    c.sprite(bean(EXCITED), 6, 5)
    # money bag
    c.oval(27, 15, 7, 5, BROWN)
    c.rect(25, 8, 29, 10, BROWN)
    c.rect(24, 10, 30, 10, YELLOW)                       # the tie
    c.text("$", 26, 13, YELLOW)
    return c


def season_bust():
    c = Canvas(44, 22)
    c.sprite(bean(SAD), 4, 2)
    c.rect(0, 14, 43, 21, BROWN)                         # the counter
    c.rect(0, 14, 43, 14, YELLOW)
    c.rect(14, 4, 43, 12, WHITE)                         # CLOSED sign
    c.rect(15, 5, 42, 11, RED)
    c.text("CLOSED", 17, 6, WHITE)
    c.px(19, 2, GREY); c.px(38, 2, GREY); c.px(20, 3, GREY); c.px(37, 3, GREY)
    return c


def trophy():
    c = Canvas(20, 20)
    c.rect(4, 1, 15, 2, YELLOW)
    c.oval(9, 5, 6, 4, YELLOW)
    c.rect(4, 1, 15, 4, YELLOW)
    c.px(2, 3, YELLOW); c.px(1, 4, YELLOW); c.px(2, 6, YELLOW)
    c.px(17, 3, YELLOW); c.px(18, 4, YELLOW); c.px(17, 6, YELLOW)
    c.rect(8, 10, 11, 13, YELLOW)
    c.rect(5, 14, 14, 15, BROWN)
    c.rect(4, 16, 15, 18, BROWN)
    c.text("1", 8, 3, BROWN)
    c.px(6, 2, WHITE); c.px(6, 3, WHITE)
    return c


PIECES = {
    "splash": splash, "weather_sun": lambda: weather("sun"),
    "weather_partly": lambda: weather("partly"), "weather_rain": lambda: weather("rain"),
    "day_sales": day_sales, "day_rain": day_rain, "day_loss": day_loss,
    "news_sugar": lambda: news("sugar"), "news_lemons": lambda: news("lemons"),
    "news_cups": lambda: news("cups"), "season_end": season_end,
    "season_bust": season_bust, "trophy": trophy,
}


def js_string(s):
    """An ES5 string literal: Ctrl-A and CP437 bytes as \\xNN escapes."""
    out = ['"']
    for ch in s:
        o = ord(ch)
        if ch in '"\\':
            out.append("\\" + ch)
        elif 0x20 <= o < 0x7f:
            out.append(ch)
        else:
            out.append("\\x%02x" % o)
    out.append('"')
    return "".join(out)


def render():
    parts = []
    for name, make in PIECES.items():
        c = make()
        rows = c.encode()
        width = max(len(__import__("re").sub("\x01.", "", r)) for r in rows)
        body = ",\n\t\t".join(js_string(r) for r in rows)
        parts.append(f"\t{name}: {{ width: {width}, height: {len(rows)}, lines: [\n\t\t{body}\n\t] }}")
    return ("// lemonade_art.js -- generated by tools/make_art.py; don't edit by hand.\n"
            "//\n"
            "// Half-block pixel art with bean characters, as Synchronet Ctrl-A coded rows\n"
            "// (print each with console.print, or place with console.gotoxy). ES5.\n"
            "\n"
            "\"use strict\";\n\n"
            "var LemonadeArt = {\n" + ",\n".join(parts) + "\n};\n\n"
            "if (typeof module !== \"undefined\" && module.exports)\n"
            "\tmodule.exports = LemonadeArt;\n"
            "LemonadeArt;   // Synchronet: load() returns the script's last value\n")


if __name__ == "__main__":
    text = render()
    if "--check" in sys.argv:
        current = open(OUT, encoding="latin-1").read() if os.path.exists(OUT) else ""
        if current != text:
            print("src/lemonade_art.js is out of date: run python3 tools/make_art.py")
            sys.exit(1)
        print("src/lemonade_art.js is up to date")
    else:
        with open(OUT, "w", encoding="latin-1", newline="\n") as f:
            f.write(text)
        print("wrote", os.path.relpath(OUT), "with", ", ".join(PIECES))
