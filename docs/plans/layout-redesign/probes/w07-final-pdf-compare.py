"""Compare native Obsidian PDFs by text/image geometry and rasterized page pixels."""
from pathlib import Path
import hashlib
import json
import sys
import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[4]
PDFS = ROOT / "dist/w07-final-pdfs"
PROBES = Path(__file__).resolve().parent
PHASE = sys.argv[1] if len(sys.argv) > 1 else "current"
EVIDENCE = "w07-acceptance" if PHASE == "acceptance" else "w07-final-current"

def geometry(page):
    items = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] == 1:
            items.append({"image": hashlib.sha256(block["image"]).hexdigest(), "box": block["bbox"]})
        else:
            for line in block["lines"]:
                items.append({"text": "".join(s["text"] for s in line["spans"]), "box": line["bbox"]})
    return items

results = []
for name in ["wrap-test", "wrap-multi", "text-test", "text-block-test"]:
    before = fitz.open(PDFS / f"baseline-{name}.pdf")
    after = fitz.open(PDFS / f"{PHASE}-{name}.pdf")
    row = {"note": name, "baselinePages": len(before), "currentPages": len(after), "pages": []}
    for index in range(max(len(before), len(after))):
        if index >= min(len(before), len(after)):
            row["pages"].append({"page": index + 1, "missing": True})
            continue
        a, b = before[index], after[index]
        ga, gb = geometry(a), geometry(b)
        pa, pb = a.get_pixmap(), b.get_pixmap()
        same_geometry = ga == gb
        same_pixels = pa.samples == pb.samples
        row["pages"].append({"page": index + 1, "items": len(ga), "geometryIdentical": same_geometry,
                             "pixelsIdentical": same_pixels, "size": [a.rect.width, a.rect.height]})
        # Keep a page with media, or the first page of a text layout, for rendered inspection.
        if any("image" in item for item in ga) or name.startswith("text"):
            if not row.get("sample"):
                target = PROBES / f"{EVIDENCE}-{name}-page-{index + 1}.png"
                b.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(target)
                row["sample"] = target.name
    row["pass"] = len(before) == len(after) and all(p.get("geometryIdentical") and p.get("pixelsIdentical") for p in row["pages"])
    results.append(row)
(PROBES / ("w07-acceptance-pdf-comparison.json" if PHASE == "acceptance" else "w07-final-pdf-comparison.json")).write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
print(json.dumps([{k: r[k] for k in ("note", "baselinePages", "currentPages", "pass")} for r in results]))
