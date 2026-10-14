"""PDF text extraction with pdfplumber; OCR (Tesseract via pypdfium2 rendering) only as a fallback."""
from __future__ import annotations

import io
import shutil
import subprocess
import tempfile
from pathlib import Path

import pdfplumber

from .text import tidy

MIN_CHARS_PER_PAGE = 120


def tesseract_path() -> str | None:
    p = shutil.which("tesseract")
    if p:
        return p
    for c in (r"C:\Program Files\Tesseract-OCR\tesseract.exe",
              str(Path.home() / "AppData/Local/Programs/Tesseract-OCR/tesseract.exe")):
        if Path(c).exists():
            return c
    return None


def extract_text(data: bytes, max_pages: int = 40) -> tuple[str, int, bool]:
    """Return (text, pages, looks_scanned)."""
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            pages = pdf.pages[:max_pages]
            parts = []
            for pg in pages:
                try:
                    parts.append(pg.extract_text(x_tolerance=1.5, y_tolerance=3) or "")
                except Exception:
                    parts.append("")
            n = len(pdf.pages)
    except Exception:
        return "", 0, True
    text = tidy("\n\n".join(parts))
    scanned = n > 0 and len(text) < MIN_CHARS_PER_PAGE * min(n, max_pages)
    return text, n, scanned


def ocr_text(data: bytes, max_pages: int = 12, dpi: int = 200) -> str | None:
    tess = tesseract_path()
    if not tess:
        return None
    import pypdfium2 as pdfium

    out = []
    with tempfile.TemporaryDirectory() as td:
        doc = pdfium.PdfDocument(data)
        for i in range(min(len(doc), max_pages)):
            img = doc[i].render(scale=dpi / 72).to_pil()
            p = Path(td) / f"p{i}.png"
            img.save(p)
            r = subprocess.run([tess, str(p), "stdout", "-l", "eng"], capture_output=True, text=True, timeout=120)
            out.append(r.stdout)
    return tidy("\n\n".join(out))
