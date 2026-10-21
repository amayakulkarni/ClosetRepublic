#!/usr/bin/env python3
"""Draws the looping pixel-art GIFs the bot posts in a voice channel's chat (bot/ambience/visuals/*.gif).

Original art, released under CC0 (see bot/ambience/CREDITS.md). Each is drawn at 160x90 and scaled
4x with hard pixel edges to 640x360, in a limited palette so the files stay small.

Needs: python3, Pillow.   Run: python3 scripts/ambience/make-visuals.py [out_dir]
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

W, H, SCALE = 160, 90, 4


def finish(frames, path, ms):
    big = [f.resize((W * SCALE, H * SCALE), Image.NEAREST).convert('P', palette=Image.ADAPTIVE, colors=48, dither=Image.NONE) for f in frames]
    big[0].save(path, save_all=True, append_images=big[1:], duration=ms, loop=0, optimize=True, disposal=1)
    print(path.name, len(frames), 'frames', path.stat().st_size // 1024, 'KB')


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def blank(color):
    return Image.new('RGB', (W, H), color)


# ---------- campfire: a stone hearth with a flickering fire ----------

def fire():
    rnd = random.Random(5)
    gw, gh = 56, 40  # fire grid
    heat = [[0.0] * gw for _ in range(gh + 2)]
    ramp = [(12, 6, 10), (60, 10, 8), (140, 28, 10), (220, 80, 12), (250, 160, 30), (255, 220, 90), (255, 250, 200)]

    def color(v):
        v = max(0.0, min(0.999, v)) * (len(ramp) - 1)
        i = int(v)
        return lerp(ramp[i], ramp[i + 1], v - i)

    def step():
        for x in range(gw):  # fuel at the bottom, strongest in the middle
            mid = 1 - abs(x - gw / 2) / (gw / 2)
            heat[gh][x] = min(1.0, 0.55 + 0.6 * mid * rnd.random() + 0.2 * mid)
        for y in range(gh):
            for x in range(gw):
                a = heat[y + 1][x]
                b = heat[y + 1][(x - 1) % gw]
                c = heat[y + 1][(x + 1) % gw]
                d = heat[min(y + 2, gh)][x]
                heat[y][x] = max(0.0, (a + b + c + d) / 4 - 0.045 - 0.02 * rnd.random())

    for _ in range(60):
        step()
    frames = []
    count = 40
    raw = []
    for _ in range(count + 12):
        step()
        raw.append([row[:] for row in heat[:gh]])
    for i in range(count):  # blend the last frames into the first ones so the loop joins
        h = raw[i]
        if i < 12:
            t = i / 12
            tail = raw[count + i]
            h = [[tail[y][x] * (1 - t) + h[y][x] * t for x in range(gw)] for y in range(gh)]
        glow = sum(h[gh - 6]) / gw
        img = blank((18, 12, 16))
        d = ImageDraw.Draw(img)
        for by in range(0, H, 6):  # bricks lit by the fire
            for bx in range(-(4 if (by // 6) % 2 else 0), W, 12):
                base = lerp((34, 26, 30), (120, 60, 34), min(1, glow * 1.6) * (1 - abs(bx - W / 2) / (W / 1.6)))
                d.rectangle([bx, by, bx + 10, by + 4], fill=tuple(int(v * 0.9) for v in base))
        d.rectangle([34, 22, 126, H], fill=(8, 6, 8))  # opening
        d.rectangle([30, 18, 130, 22], fill=(70, 58, 64))
        d.rectangle([30, H - 8, 130, H], fill=(70, 58, 64))
        ox, oy = 52, 26
        for y in range(gh):
            for x in range(gw):
                v = h[y][x]
                if v > 0.08:
                    d.rectangle([ox + x, oy + y, ox + x, oy + y], fill=color(v * 1.15))
        d.rectangle([42, H - 14, 118, H - 9], fill=(60, 36, 22))  # logs
        d.rectangle([48, H - 17, 108, H - 13], fill=(78, 48, 28))
        d.ellipse([40, H - 14, 46, H - 9], fill=(110, 70, 40))
        frames.append(img)
    return frames, 80


# ---------- hammock on a beach ----------

def beach():
    frames = []
    count = 48
    for i in range(count):
        p = 2 * math.pi * i / count
        img = blank((250, 200, 160))
        d = ImageDraw.Draw(img)
        for y in range(0, 44):  # sunset sky
            d.line([(0, y), (W, y)], fill=lerp((120, 90, 170), (250, 190, 150), y / 44))
        d.ellipse([100, 26, 124, 50], fill=(255, 238, 190))
        for y in range(44, 66):  # sea
            d.line([(0, y), (W, y)], fill=lerp((60, 120, 170), (40, 90, 140), (y - 44) / 22))
        for k in range(6):  # glitter on the water
            y = 48 + k * 3
            x = 112 + int(6 * math.sin(p + k))
            d.line([(x - 6 + k, y), (x + 6 - k, y)], fill=(255, 236, 190))
        shore = 60 + 4 * math.sin(p)  # surf moving in and out
        for x in range(W):
            wob = 1.8 * math.sin(x / 9 + p) + 1.2 * math.sin(x / 4 - 2 * p)
            d.line([(x, int(shore + wob)), (x, int(shore + wob) + 1)], fill=(245, 250, 250))
            d.line([(x, int(shore + wob) + 2), (x, int(shore + wob) + 3)], fill=(150, 200, 220))
        for y in range(66, H):  # sand
            d.line([(0, y), (W, y)], fill=lerp((236, 206, 150), (206, 170, 118), (y - 66) / 24))
        d.rectangle([14, 36, 18, 84], fill=(70, 48, 40))  # palm trunks
        d.rectangle([144, 38, 148, 84], fill=(70, 48, 40))
        for cx, cy, sign in ((16, 36, 1), (146, 38, -1)):  # fronds
            for a in range(-2, 3):
                ex = cx + sign * (10 + abs(a) * 3) + int(2 * math.sin(p + a))
                ey = cy - 8 + a * 5
                d.line([(cx, cy), (ex, ey)], fill=(34, 96, 66), width=2)
        sway = 2.2 * math.sin(p)  # the hammock
        pts = [(18 + t * 1.26, 50 + 17 * math.sin(math.pi * t / 100) + sway * math.sin(math.pi * t / 100)) for t in range(0, 101, 4)]
        d.line(pts, fill=(230, 90, 100), width=3)
        d.line([(x, y + 2) for x, y in pts], fill=(170, 50, 70), width=1)
        frames.append(img)
    return frames, 100


# ---------- the clock: pendulum swing, one tick per half second ----------

def clock():
    frames = []
    for i in range(120):  # 60 seconds, one frame per half second, so the second hand makes a full turn
        img = blank((36, 24, 30))
        d = ImageDraw.Draw(img)
        for x in range(0, W, 8):  # wallpaper stripes
            d.line([(x, 0), (x, H)], fill=(44, 30, 38))
        d.rectangle([60, 4, 100, 62], fill=(96, 58, 34))  # case
        d.rectangle([62, 6, 98, 60], fill=(70, 40, 24))
        cx, cy = 80, 26
        d.ellipse([cx - 17, cy - 17, cx + 17, cy + 17], fill=(236, 224, 196), outline=(40, 24, 14))
        for n in range(12):
            a = n * math.pi / 6
            r1, r2 = (13, 16) if n % 3 == 0 else (14.5, 16)
            d.line([(cx + r1 * math.sin(a), cy - r1 * math.cos(a)), (cx + r2 * math.sin(a), cy - r2 * math.cos(a))], fill=(40, 24, 14))
        sec = (i // 2) % 60
        mins = 8 + sec / 60
        d.line([(cx, cy), (cx + 8 * math.sin(math.radians(30 * 10 + mins * 0.5)), cy - 8 * math.cos(math.radians(30 * 10 + mins * 0.5)))], fill=(30, 20, 14), width=2)
        d.line([(cx, cy), (cx + 12 * math.sin(math.radians(mins * 6)), cy - 12 * math.cos(math.radians(mins * 6)))], fill=(30, 20, 14), width=1)
        d.line([(cx, cy), (cx + 14 * math.sin(math.radians(sec * 6)), cy - 14 * math.cos(math.radians(sec * 6)))], fill=(190, 40, 40))
        d.ellipse([cx - 1, cy - 1, cx + 1, cy + 1], fill=(190, 40, 40))
        swing = 9 if i % 2 else -9  # tick, tock
        d.line([(cx, 44), (cx + swing, 76)], fill=(200, 160, 60))
        d.ellipse([cx + swing - 6, 74, cx + swing + 6, 86], fill=(214, 170, 64), outline=(120, 86, 24))
        d.rectangle([0, 86, W, H], fill=(24, 16, 20))
        frames.append(img)
    return frames, 500


# ---------- coffee being brewed ----------

def coffee():
    frames = []
    count = 36
    for i in range(count):
        p = 2 * math.pi * i / count
        img = blank((60, 40, 34))
        d = ImageDraw.Draw(img)
        for x in range(0, W, 16):  # tiled wall
            d.line([(x, 0), (x, 62)], fill=(70, 48, 40))
        d.rectangle([0, 62, W, H], fill=(104, 70, 44))  # counter
        d.rectangle([0, 62, W, 64], fill=(140, 100, 62))
        d.rectangle([58, 16, 102, 24], fill=(40, 40, 46))  # machine
        d.rectangle([62, 24, 98, 28], fill=(70, 70, 78))
        d.rectangle([76, 28, 84, 38], fill=(90, 90, 98))  # spout
        d.rectangle([54, 14, 58, 62], fill=(40, 40, 46))
        d.rectangle([102, 14, 106, 62], fill=(40, 40, 46))
        d.rectangle([58, 58, 102, 62], fill=(30, 30, 36))
        d.rectangle([70, 46, 90, 58], fill=(238, 232, 220), outline=(120, 110, 100))  # cup
        d.rectangle([90, 49, 93, 53], outline=(238, 232, 220))
        level = 50 + int(2 * (0.5 + 0.5 * math.sin(p)))
        d.rectangle([72, level, 88, 57], fill=(86, 46, 22))
        drop = (i * 6) % 24  # a thin stream with falling beads
        d.line([(80, 38), (80, 38 + min(8, drop))], fill=(110, 62, 30))
        if drop > 8:
            d.rectangle([79, 38 + drop // 2, 80, 40 + drop // 2], fill=(110, 62, 30))
        for k in range(3):  # steam
            for s in range(10):
                y = 44 - s * 3
                x = 74 + k * 6 + int(2.2 * math.sin(p + s * 0.8 + k * 2))
                shade = lerp((210, 200, 190), (60, 40, 34), s / 10)
                d.point((x, y), fill=shade)
                d.point((x + 1, y), fill=shade)
        d.rectangle([108, 36, 128, 62], fill=(190, 80, 70))  # a jar of beans
        d.rectangle([108, 36, 128, 40], fill=(120, 40, 36))
        frames.append(img)
    return frames, 100


# ---------- black cat in a dark alley ----------

def cat():
    frames = []
    count = 48
    for i in range(count):
        p = 2 * math.pi * i / count
        img = blank((16, 18, 30))
        d = ImageDraw.Draw(img)
        for by in range(0, H, 6):  # wet brick
            for bx in range(-(5 if (by // 6) % 2 else 0), W, 14):
                d.rectangle([bx, by, bx + 12, by + 4], fill=(30, 32, 50) if (bx // 14 + by) % 3 else (36, 38, 58))
        flick = 0.85 + 0.15 * math.sin(3 * p)
        for r in range(34, 6, -4):  # street lamp glow, top right
            t = (34 - r) / 28 * flick
            d.ellipse([130 - r, 8 - r, 130 + r, 8 + r], fill=lerp((30, 32, 50), (150, 120, 60), t * 0.55))
        d.rectangle([128, 0, 132, 10], fill=(40, 40, 50))
        d.rectangle([0, 78, W, H], fill=(10, 10, 18))  # ground with a puddle
        d.ellipse([20, 82, 70, 88], fill=(30, 40, 66))
        tail_x = 98 + 10 * math.sin(p)
        d.line([(88, 74), (96, 76), (tail_x, 66), (tail_x + 4 * math.sin(p + 1), 54)], fill=(6, 6, 10), width=3)
        d.ellipse([60, 46, 92, 80], fill=(6, 6, 10))  # body
        d.ellipse([64, 28, 88, 50], fill=(6, 6, 10))  # head
        d.polygon([(64, 34), (66, 22), (73, 30)], fill=(6, 6, 10))  # ears
        d.polygon([(88, 34), (86, 22), (79, 30)], fill=(6, 6, 10))
        d.rectangle([64, 70, 70, 80], fill=(6, 6, 10))  # front paws
        d.rectangle([80, 70, 86, 80], fill=(6, 6, 10))
        blink = i in (30, 31)
        for ex in (70, 82):
            if blink:
                d.line([(ex - 2, 40), (ex + 2, 40)], fill=(230, 190, 40))
            else:
                d.ellipse([ex - 3, 37, ex + 3, 43], fill=(240, 200, 40))
                d.rectangle([ex, 37, ex, 43], fill=(10, 10, 10))
        frames.append(img)
    return frames, 100


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else 'bot/ambience/visuals')
    out.mkdir(parents=True, exist_ok=True)
    for name, make in (('fire', fire), ('beach', beach), ('clock', clock), ('coffee', coffee), ('cat', cat)):
        frames, ms = make()
        finish(frames, out / f'{name}.gif', ms)


if __name__ == '__main__':
    main()
