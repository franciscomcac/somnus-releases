"""Draw Luna, the bundled Somnus desktop pet (original art, generated procedurally).

Output follows the petdex/Codex atlas contract the pet renderer reads
(``agent/pet/constants.py``): 8 columns x 9 rows of 192x208 frames, rows in
``CODEX_STATE_ROWS`` order, all 8 frames used per row, transparent background.

    python scripts/somnus/make_pet_sprite.py agent/pet/bundled/luna/spritesheet.webp

Everything is drawn at 4x and downsampled, so edges stay smooth.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

FRAME_W, FRAME_H = 192, 208
COLS, ROWS = 8, 9
FRAMES = 8  # every atlas column is a real frame (the renderer plays all non-blank columns)
SS = 4  # supersampling factor

ROWS_ORDER = ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"]

BODY = (238, 236, 248, 255)
SHADE = (196, 192, 220, 255)
OUTLINE = (27, 26, 34, 255)
CHEEK = (255, 170, 190, 200)
STAR = (255, 214, 102, 255)
INK = (27, 26, 34, 255)
Z_INK = (150, 146, 190, 255)


def _crescent_mask(w: int, h: int, cx: float, cy: float, r: float, cut_dx: float, cut_dy: float, cut_r: float) -> Image.Image:
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    d.ellipse([cx + cut_dx - cut_r, cy + cut_dy - cut_r, cx + cut_dx + cut_r, cy + cut_dy + cut_r], fill=0)
    return mask


def _star(d: ImageDraw.ImageDraw, x: float, y: float, s: float, fill=STAR) -> None:
    """Four-point star like the Somnus logo."""
    k = s * 0.28
    pts = [(x, y - s), (x + k, y - k), (x + s, y), (x + k, y + k), (x, y + s), (x - k, y + k), (x - s, y), (x - k, y - k)]
    d.polygon(pts, fill=fill)


def _draw_z(d: ImageDraw.ImageDraw, x: float, y: float, s: float, alpha: int) -> None:
    col = Z_INK[:3] + (alpha,)
    w = max(2, int(s * 0.22))
    d.line([(x, y), (x + s, y)], fill=col, width=w)
    d.line([(x + s, y), (x, y + s)], fill=col, width=w)
    d.line([(x, y + s), (x + s, y + s)], fill=col, width=w)


def draw_frame(state: str, i: int) -> Image.Image:
    W, H = FRAME_W * SS, FRAME_H * SS
    t = i / FRAMES  # 0..1 loop phase
    ph = 2 * math.pi * t

    # Pose parameters
    dx = dy = 0.0
    sx = sy = 1.0
    tilt = 0.0
    eyes = "open"
    mouth = "smile"
    arm = None
    extras: list[str] = []

    if state == "idle":
        dy = -6 * math.sin(ph)
        sy = 1 + 0.02 * math.sin(ph)
        eyes = "closed" if i == 4 else "open"
    elif state in ("running-right", "running-left", "running"):
        hop = abs(math.sin(ph))
        dy = -22 * hop
        sy = 1 - 0.08 * (1 - hop)
        sx = 1 + 0.06 * (1 - hop)
        if state != "running":
            tilt = -10 if state == "running-right" else 10
            extras.append("speed-" + ("right" if state == "running-right" else "left"))
        mouth = "open"
    elif state == "waving":
        dy = -3 * math.sin(ph)
        arm = math.sin(ph * 2) * 35
        mouth = "open"
    elif state == "jumping":
        arc = math.sin(math.pi * t)
        dy = -34 * arc
        squash = 1 - arc
        sy = 1 - 0.14 * squash if i in (0, 5) else 1 + 0.06 * arc
        sx = 1 + 0.12 * squash if i in (0, 5) else 1 - 0.03 * arc
        mouth = "open"
        extras.append("sparkle")
    elif state == "failed":
        dy = 10
        sy = 0.93
        tilt = 6 * math.sin(ph)
        eyes = "x"
        mouth = "frown"
        extras.append("sweat")
    elif state == "waiting":
        dy = -3 * math.sin(ph)
        eyes = "closed"
        mouth = "o"
        extras.append("zzz")
    elif state == "review":
        dy = -2 * math.sin(ph)
        eyes = "look"
        mouth = "flat"
        extras.append("think")

    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # Body on its own layer so it can be scaled/tilted around its base.
    body = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cx, cy, r = W * 0.5, H * 0.56, W * 0.30
    outer = _crescent_mask(W, H, cx, cy, r + 3 * SS, r * 0.62, -r * 0.42, r * 0.72 - 3 * SS)
    inner = _crescent_mask(W, H, cx, cy, r, r * 0.62, -r * 0.42, r * 0.72)
    body.paste(Image.new("RGBA", (W, H), OUTLINE), mask=outer)
    body.paste(Image.new("RGBA", (W, H), BODY), mask=inner)
    # soft inner shade along the outer rim
    shade = ImageChops.subtract(inner, _crescent_mask(W, H, cx + r * 0.08, cy - r * 0.08, r * 0.9, r * 0.62, -r * 0.42, r * 0.72))
    body.paste(Image.new("RGBA", (W, H), SHADE), mask=shade.filter(ImageFilter.GaussianBlur(2 * SS)))

    d = ImageDraw.Draw(body)
    # face sits on the thick lower-left part of the crescent
    fx, fy = cx - r * 0.30, cy + r * 0.22
    if eyes == "look":
        fx += r * 0.05
        fy -= r * 0.06
    ex = r * 0.20
    er = r * 0.075
    for side in (-1, 1):
        x = fx + side * ex
        y = fy - r * 0.08
        if eyes == "open" or eyes == "look":
            d.ellipse([x - er, y - er * 1.25, x + er, y + er * 1.25], fill=INK)
            d.ellipse([x - er * 0.35 + er * 0.25, y - er * 0.9, x + er * 0.35 + er * 0.25, y - er * 0.2], fill=(255, 255, 255, 255))
        elif eyes == "closed":
            d.arc([x - er * 1.3, y - er, x + er * 1.3, y + er * 1.2], 20, 160, fill=INK, width=int(2.2 * SS))
        elif eyes == "x":
            k = er * 1.1
            d.line([(x - k, y - k), (x + k, y + k)], fill=INK, width=int(2.4 * SS))
            d.line([(x - k, y + k), (x + k, y - k)], fill=INK, width=int(2.4 * SS))
        # cheeks
        d.ellipse([x - er * 1.4 + side * er * 0.6, y + er * 1.6, x + er * 1.4 + side * er * 0.6, y + er * 2.5], fill=CHEEK)
    my = fy + r * 0.12
    mw = r * 0.11
    if mouth == "smile":
        d.arc([fx - mw, my - mw, fx + mw, my + mw * 0.9], 15, 165, fill=INK, width=int(2.2 * SS))
    elif mouth == "open":
        d.chord([fx - mw, my - mw * 0.6, fx + mw, my + mw * 1.2], 0, 180, fill=INK)
    elif mouth == "frown":
        d.arc([fx - mw, my, fx + mw, my + mw * 1.6], 200, 340, fill=INK, width=int(2.2 * SS))
    elif mouth == "o":
        d.ellipse([fx - mw * 0.45, my - mw * 0.1, fx + mw * 0.45, my + mw * 0.8], fill=INK)
    elif mouth == "flat":
        d.line([(fx - mw * 0.8, my + mw * 0.3), (fx + mw * 0.8, my + mw * 0.3)], fill=INK, width=int(2.2 * SS))

    # little arm nub for waving: a rounded mitten that swings from the left rim
    if arm is not None:
        ax, ay = cx - r * 0.86, cy + r * 0.05
        ang = math.radians(200 + arm)
        L = r * 0.34
        bx, by = ax + math.cos(ang) * L, ay + math.sin(ang) * L
        for width, col in ((int(15 * SS), OUTLINE), (int(10 * SS), BODY)):
            d.line([(ax, ay), (bx, by)], fill=col, width=width)
            rr = width / 2
            d.ellipse([bx - rr, by - rr, bx + rr, by + rr], fill=col)

    # feet
    for side in (-1, 1):
        x = cx - r * 0.25 + side * r * 0.28
        y = cy + r * 0.98
        d.ellipse([x - r * 0.13, y - r * 0.07, x + r * 0.13, y + r * 0.07], fill=OUTLINE)

    # squash/stretch + tilt around the feet
    if sx != 1 or sy != 1:
        nw, nh = int(W * sx), int(H * sy)
        body = body.resize((nw, nh), Image.LANCZOS)
        tmp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        tmp.paste(body, ((W - nw) // 2, int(H * 0.86 - nh * 0.86)), body)
        body = tmp
    if tilt:
        body = body.rotate(tilt, resample=Image.BICUBIC, center=(W * 0.5, H * 0.86))

    # ground shadow (does not move with the hop, shrinks as we rise)
    lift = max(0.0, -dy) / 34.0
    sh_w = r * (1.0 - 0.45 * min(1.0, lift / 1.0)) * 0.9
    sd = ImageDraw.Draw(canvas)
    sd.ellipse([cx - sh_w, H * 0.885 - r * 0.07, cx + sh_w, H * 0.885 + r * 0.07], fill=(0, 0, 0, 55))

    canvas.alpha_composite(body, (int(dx * SS), int(dy * SS)))

    # floating companion star near the crescent tip, twinkling
    od = ImageDraw.Draw(canvas)
    tw = 1 + 0.25 * math.sin(ph * 2)
    sx0, sy0 = cx + r * 0.78, cy - r * 0.92 + dy * SS + 6 * SS * math.sin(ph + 1)
    _star(od, sx0, sy0, r * 0.16 * tw)

    for e in extras:
        if e.startswith("speed-"):
            right = e.endswith("right")
            for k in range(3):
                y = cy - r * 0.2 + k * r * 0.35 + dy * SS
                x0 = cx + (-1 if right else 1) * r * (1.15 + 0.1 * k)
                x1 = x0 + (-1 if right else 1) * r * 0.45
                od.line([(x0, y), (x1, y)], fill=(150, 146, 190, 160), width=int(3 * SS))
        elif e == "sparkle":
            for k in range(3):
                a = ph + k * 2.1
                _star(od, cx + math.cos(a) * r * 1.25, cy + math.sin(a) * r * 0.9 + dy * SS, r * 0.07, fill=(255, 214, 102, 200))
        elif e == "sweat":
            x, y = cx - r * 0.78, cy - r * 0.55 + dy * SS
            od.ellipse([x - r * 0.06, y, x + r * 0.06, y + r * 0.16], fill=(120, 190, 255, 230))
        elif e == "zzz":
            for k in range(3):
                p = (t + k / 3) % 1.0
                zx = cx + r * (0.55 + 0.35 * p)
                zy = cy - r * (0.55 + 0.9 * p)
                _draw_z(od, zx, zy, r * (0.14 + 0.08 * k), int(255 * (1 - p)))
        elif e == "think":
            for k, (ox, oy, rr) in enumerate([(0.95, -0.65, 0.05), (1.1, -0.9, 0.075), (1.2, -1.2, 0.11)]):
                if i % FRAMES >= k:
                    od.ellipse([cx + r * ox - r * rr, cy + r * oy - r * rr + dy * SS, cx + r * ox + r * rr, cy + r * oy + r * rr + dy * SS],
                               fill=(255, 255, 255, 235), outline=OUTLINE, width=int(1.6 * SS))

    return canvas.resize((FRAME_W, FRAME_H), Image.LANCZOS)


def build_atlas() -> Image.Image:
    atlas = Image.new("RGBA", (FRAME_W * COLS, FRAME_H * ROWS), (0, 0, 0, 0))
    for row, state in enumerate(ROWS_ORDER):
        for col in range(COLS):
            frame = draw_frame(state, col % FRAMES)
            atlas.paste(frame, (col * FRAME_W, row * FRAME_H), frame)
    return atlas


def main() -> int:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "spritesheet.webp")
    out.parent.mkdir(parents=True, exist_ok=True)
    build_atlas().save(out, format="WEBP", lossless=True, quality=100, method=6, exact=True)
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
