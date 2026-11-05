"""Offline derivatives of approved PNGs; never runs during catalog import/build."""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path

from PIL import Image, __version__ as pillow_version

RECIPE = f"rgba-lanczos-webp-lossless-exact-method4-v1-pillow{pillow_version}"
HOME_IMAGE = "/product-images/generated/pvs__3core__jacket-black-pvc.png"
WAREHOUSE_IMAGE = "/cable-warehouse-illustration.png"


def prepare(job):
    root, source = job
    public = root / "public"
    original = (public / source.lstrip("/")).resolve()
    if not original.is_relative_to(public.resolve()):
        raise ValueError(f"Image outside public: {source}")
    data = original.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    key = hashlib.sha256((digest + RECIPE).encode()).hexdigest()[:20]
    with Image.open(original) as opened:
        if opened.getexif().get(274, 1) != 1:
            raise ValueError(f"Normalize EXIF orientation before preparing {source}")
        image = opened.convert("RGBA")
        profile = opened.info.get("icc_profile")
    width, height = image.size
    variants = []
    created = 0
    for size in sorted({min(width, n) for n in (320, 640, 960, width)}):
        target = image if size == width else image.resize(
            (size, max(1, round(height * size / width))), Image.Resampling.LANCZOS
        )
        url = f"/responsive-images/{key}/{size}.webp"
        output = public / url.lstrip("/")
        if not output.exists():
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary = output.with_suffix(f".{os.getpid()}.tmp.webp")
            options = dict(lossless=True, exact=True, quality=100, method=4)
            if profile:
                options["icc_profile"] = profile
            target.save(temporary, "WEBP", **options)
            temporary.replace(output)
            created += 1
        with Image.open(output) as encoded:
            if encoded.convert("RGBA").tobytes() != target.tobytes():
                raise ValueError(f"Derivative pixel mismatch: {url}")
            if encoded.info.get("icc_profile") != profile:
                raise ValueError(f"Derivative ICC mismatch: {url}")
        variants.append({"src": url, "width": size})
    return source, {"sourceSha256": digest, "width": width, "height": height,
                    "variants": variants}, {
        "sourceBytes": len(data), "created": created,
        "variantBytes": sum((public / v["src"].lstrip("/")).stat().st_size for v in variants),
    }


def write_json(path, value):
    temporary = path.with_suffix(".tmp.json")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=2, choices=range(1, 5))
    args = parser.parse_args()
    root = args.project_root.resolve()
    register = json.loads((root / "shared/generatedProductImages.json").read_text())
    sources = {record["image"] for record in register["bySku"].values()
               if record.get("status") == "approved" and record.get("image", "").endswith(".png")}
    sources.update((HOME_IMAGE, WAREHOUSE_IMAGE))
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
        rows = list(pool.map(prepare, ((root, s) for s in sorted(sources))))
    images = {source: record for source, record, _ in rows}
    # Activate metadata only after every referenced file passed pixel verification.
    write_json(root / "shared/responsiveImageManifest.json", {"recipe": RECIPE, "images": images})
    write_json(root / "shared/homeImageVariants.json", images[HOME_IMAGE]["variants"])
    warehouse = images[WAREHOUSE_IMAGE]["variants"]
    def candidate(size):
        return next((v["src"] for v in warehouse if v["width"] >= size), warehouse[-1]["src"])
    css = ['@supports (background-image: image-set(url("/probe.webp") type("image/webp"))) {',
           "/* Offline generated; originals remain PNG fallbacks. */"]
    for minimum, width in ((0, 640), (641, 960), (961, images[WAREHOUSE_IMAGE]["width"])):
        css.append(f'@media (min-width: {minimum}px) {{ .home-concept__quote {{ --warehouse-image: '
                   f'image-set(url("{candidate(width)}") 1x type("image/webp"), '
                   f'url("{candidate(width * 2)}") 2x type("image/webp"), '
                   f'url("{WAREHOUSE_IMAGE}") 1x type("image/png")); }} }}')
    css.append("}")
    (root / "src/styles/sections/responsive-warehouse.css").write_text("\n".join(css) + "\n")
    print(json.dumps({"images": len(rows), "variants": sum(len(r[1]["variants"]) for r in rows),
                      "created": sum(r[2]["created"] for r in rows),
                      "sourceBytes": sum(r[2]["sourceBytes"] for r in rows),
                      "variantBytes": sum(r[2]["variantBytes"] for r in rows),
                      "allDecodedPixelsMatchTargets": True, "recipe": RECIPE}))


if __name__ == "__main__":
    main()
