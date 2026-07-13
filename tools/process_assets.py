"""Painted-asset pipeline (rebuild Phase 2).

raw sheets (assets/raw, charcoal background)
  -> soft chroma key to alpha (+ de-fringe + 1px erosion)
  -> gap-bounded cell slicing (row bands, then columns per band)
  -> bottom-center repack into single-row uniform strips (origin 0.5/1 in Phaser)
  -> carton white-band overlay extraction (runtime tinting)
  -> downscale, packed PNGs + metadata.json + light-bg QA previews

Run:  py tools/process_assets.py
"""
import json
import math
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "assets", "raw")
OUT = os.path.join(ROOT, "assets", "processed")
os.makedirs(OUT, exist_ok=True)

PREVIEW_BG = (221, 226, 229, 255)  # THEME floor bright — QA against light ground

# name, file, target packed frame height px, expected row layout (None = free)
SHEETS = [
    ("dock_doors", "dock_doors.png", 300, [5]),
    ("conveyor", "conveyor.png", 170, [3]),
    ("pallets", "pallets.png", 170, [4, 4]),
    ("cartons", "cartons.png", 96, [4]),
    ("dressing", "dressing.png", 210, [4, 4]),
    ("worker_A", "worker_A.png", 176, [3, 7, 3, 5]),
    ("worker_B", "worker_B.png", 176, [3, 7, 3, 5]),
    ("worker_C", "worker_C.png", 176, [3, 7, 3, 5]),
    ("worker_D", "worker_D.png", 176, [3, 7, 3, 5]),
    ("rc_operator", "rc_operator.png", 190, [2]),
]


def key_out(img, t0=6.0, t1=18.0):
    """Charcoal bg -> alpha, flood-connected: only near-bg pixels CONNECTED TO THE
    IMAGE BORDER are keyed, so dark object interiors (grey trousers, closed
    shutters) stay opaque. Soft fringe keeps partial alpha; colors de-fringed."""
    a = np.asarray(img.convert("RGB"), dtype=np.float32)
    corners = np.concatenate([
        a[:24, :24].reshape(-1, 3), a[:24, -24:].reshape(-1, 3),
        a[-24:, :24].reshape(-1, 3), a[-24:, -24:].reshape(-1, 3),
    ])
    bg = np.median(corners, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(-1))

    near = dist < t1
    labels, _ = ndimage.label(near, structure=np.ones((3, 3), dtype=int))
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    border = border[border != 0]
    bg_mask = np.isin(labels, border)

    alpha = np.ones_like(dist)
    edge = np.clip((dist - t0) / (t1 - t0), 0.0, 1.0)
    edge = edge * edge * (3.0 - 2.0 * edge)  # smoothstep
    alpha[bg_mask] = edge[bg_mask]

    al = np.maximum(alpha[..., None], 1e-3)
    obj = np.where((bg_mask & (alpha > 0))[..., None],
                   np.clip(bg + (a - bg) / al, 0, 255), a)  # de-fringe fringe only
    # 1px erosion (3x3 min) kills the residual dark rim at the silhouette
    amin = alpha.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            amin = np.minimum(amin, np.roll(np.roll(alpha, dy, 0), dx, 1))
    rgba = np.dstack([obj, amin * 255.0]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA"), amin


def runs(profile, gap, min_size):
    """Contiguous True runs, merging runs separated by < gap, dropping tiny ones."""
    idx = np.where(profile)[0]
    if idx.size == 0:
        return []
    out = []
    start = prev = int(idx[0])
    for i in idx[1:]:
        i = int(i)
        if i - prev >= gap:
            out.append((start, prev + 1))
            start = i
        prev = i
    out.append((start, prev + 1))
    return [(s, e) for s, e in out if e - s >= min_size]


def find_rows_of_cells(alpha, thr=0.16):
    H, W = alpha.shape
    mask = alpha > thr
    gap = max(12, W // 160)
    min_size = max(16, W // 160)
    rows = []
    for y0, y1 in runs(mask.any(axis=1), gap, min_size):
        band = mask[y0:y1]
        cells = []
        for x0, x1 in runs(band.any(axis=0), gap, min_size):
            ys, xs = np.where(band[:, x0:x1])
            cells.append((x0 + int(xs.min()), y0 + int(ys.min()),
                          x0 + int(xs.max()) + 1, y0 + int(ys.max()) + 1))
        rows.append(cells)
    return rows


def find_cells_components(alpha, thr=0.16, merge_px=40, min_area=4000):
    """Connected-component cells for sheets whose items overlap in projection
    (e.g. long diagonal conveyors). Nearby components are merged, sorted by x."""
    mask = alpha > thr
    labels, n = ndimage.label(mask, structure=np.ones((3, 3), dtype=int))
    px_areas = ndimage.sum(mask, labels, index=np.arange(1, labels.max() + 1))
    boxes = []
    areas = []
    for i, sl in enumerate(ndimage.find_objects(labels)):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if px_areas[i] >= min_area / 4:
            boxes.append([x0, y0, x1, y1])
            areas.append(float(px_areas[i]))
    # absorb small fragments (stray rollers, shadow blobs) into the nearest big
    # item; never merge two big items — overlapping bboxes of diagonals are fine.
    # big/small is judged by PIXEL area (bbox area lies for diagonal shapes).
    big_cut = 0.25 * max(areas)
    bigs = [b for b, a in zip(boxes, areas) if a >= big_cut]
    for s in (b for b, a in zip(boxes, areas) if a < big_cut):
        cx, cy = (s[0] + s[2]) / 2, (s[1] + s[3]) / 2
        host = min(bigs, key=lambda b: abs((b[0] + b[2]) / 2 - cx) + abs((b[1] + b[3]) / 2 - cy))
        host[0] = min(host[0], s[0]); host[1] = min(host[1], s[1])
        host[2] = max(host[2], s[2]); host[3] = max(host[3], s[3])
    bigs.sort(key=lambda b: b[0])
    return [[tuple(b) for b in bigs]]


def pack_strip(img, cells, target_h, pad=2):
    """Single-row strip, uniform frames, bottom-center anchored, LANCZOS downscale."""
    crops = [img.crop(b) for b in cells]
    maxw = max(c.width for c in crops)
    maxh = max(c.height for c in crops)
    scale = min(1.0, target_h / maxh)
    fw = int(math.ceil(maxw * scale)) + pad * 2
    fh = int(math.ceil(maxh * scale)) + pad * 2
    fw += fw % 2
    fh += fh % 2
    strip = Image.new("RGBA", (fw * len(crops), fh), (0, 0, 0, 0))
    for i, c in enumerate(crops):
        cs = c.resize((max(1, round(c.width * scale)), max(1, round(c.height * scale))), Image.LANCZOS)
        strip.paste(cs, (i * fw + (fw - cs.width) // 2, fh - pad - cs.height), cs)
    return strip, fw, fh, scale


def band_overlay(strip, fw, fh, n):
    """White-band mask per frame -> tintable overlay strip (white RGBA)."""
    a = np.asarray(strip, dtype=np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    # the band is neutral even in shadow (sat~0), kraft is strongly saturated
    # (~0.5) even in highlights — saturation separates them, not brightness
    white = (alpha > 128) & (sat < 0.30) & (mx > 120)
    w = white.astype(np.float32)
    wmin = w.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            wmin = np.minimum(wmin, np.roll(np.roll(w, dy, 0), dx, 1))
    out = np.zeros_like(a)
    out[..., :3] = 255.0
    out[..., 3] = wmin * 255.0
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def preview(strip, path):
    bg = Image.new("RGBA", strip.size, PREVIEW_BG)
    bg.alpha_composite(strip)
    bg.convert("RGB").save(path)


def main():
    meta = {}
    for name, fname, target_h, expect in SHEETS:
        src = Image.open(os.path.join(RAW, fname))
        keyed, alpha = key_out(src)
        rows = (find_cells_components(alpha) if name == "conveyor"
                else find_rows_of_cells(alpha))
        counts = [len(r) for r in rows]
        status = "OK" if (expect is None or counts == expect) else f"MISMATCH expected {expect}"
        cells = [b for row in rows for b in row]
        strip, fw, fh, scale = pack_strip(keyed, cells, target_h)
        strip.save(os.path.join(OUT, f"{name}.png"), optimize=True)
        preview(strip, os.path.join(OUT, f"preview_{name}.jpg"))
        meta[name] = {"frames": len(cells), "frameWidth": fw, "frameHeight": fh, "rows": counts}
        print(f"{name:12s} rows={counts} -> {len(cells)} frames {fw}x{fh} (x{scale:.3f}) [{status}]")
        if name == "cartons":
            ov = band_overlay(strip, fw, fh, len(cells))
            ov.save(os.path.join(OUT, "carton_bands.png"), optimize=True)
            preview(ov, os.path.join(OUT, "preview_carton_bands.jpg"))
            meta["carton_bands"] = {"frames": len(cells), "frameWidth": fw, "frameHeight": fh}
            print(f"{'carton_bands':12s} overlay strip written")

    # floor: cover-crop the tile render to 16:9 and downscale (soft texture upscales fine)
    fl = Image.open(os.path.join(RAW, "floor_tile.png")).convert("RGB")
    W, H = fl.size
    tw, th = W, int(W * 720 / 1280)
    if th > H:
        th, tw = H, int(H * 1280 / 720)
    x0, y0 = (W - tw) // 2, (H - th) // 2
    floor = fl.crop((x0, y0, x0 + tw, y0 + th)).resize((960, 540), Image.LANCZOS)
    floor.save(os.path.join(OUT, "floor.png"), optimize=True)
    meta["floor"] = {"frames": 1, "frameWidth": 960, "frameHeight": 540}
    print(f"{'floor':12s} 960x540 cover crop")

    with open(os.path.join(OUT, "metadata.json"), "w") as f:
        json.dump(meta, f, indent=1)
    total = sum(os.path.getsize(os.path.join(OUT, f"{n}.png")) for n in meta) / 1e6
    print(f"\npacked total: {total:.2f} MB")


if __name__ == "__main__":
    main()
