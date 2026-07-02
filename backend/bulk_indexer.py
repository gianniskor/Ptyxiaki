"""
bulk_indexer.py  –  crawl a dataset folder and index all PDFs / Word docs into Solr.

Usage:
    python bulk_indexer.py --dataset /path/to/dataset
    python bulk_indexer.py --dataset /path/to/dataset --solr http://localhost:8983/solr/nomologia --batch 20
"""

import argparse
import os
import re
import uuid
from pathlib import Path

import fitz          # pip install pymupdf
import httpx         # pip install httpx

try:
    import docx as python_docx
    DOCX_OK = True
except ImportError:
    DOCX_OK = False

try:
    import docx2txt
    DOCX2TXT_OK = True
except ImportError:
    DOCX2TXT_OK = False

SOLR_URL   = os.environ["SOLR_URL"]
SUPPORTED  = {".pdf", ".doc", ".docx"}

NUMBER_PREFIX = re.compile(r"^\d+\.?\d*[\s.\-]+")
DOTS_SUFFIX   = re.compile(r"\s*\.{2,}.*$")


def truncate_at_dots(name: str) -> str:
    """Strip padding dots and everything after: '1.12 ΝΟΜΟΘΕΣΙΑ ... 2022' -> '1.12 ΝΟΜΟΘΕΣΙΑ'"""
    return DOTS_SUFFIX.sub("", name).strip()

# TODO: revise the organisation names
KNOWN_ORGS = [
    "ΤΕΕ", "ΕΛΟΤ", "ΥΠΕΝ", "ΔΕΗ", "ΕΦΚΑ", "ΙΚΑ", "ΟΣΕ",
    "ΑΔΜΗΕ", "ΔΕΔΔΗΕ", "ISO", "ΚΕΠΕΑ", "ΕΦΕΤ", "ΤΕΙ", "ΕΜΠ",
]
ORG_SUFFIX_RE = re.compile(
    r'\b[\w\s]{2,25}?\s+(?:Α\.?Ε\.?|ΕΠΕ|ΑΕΒΕ|ΑΕ|ΙΚΕ)\b', re.UNICODE
)
KNOWN_ORG_RE = re.compile(
    r'\b(' + '|'.join(re.escape(o) for o in KNOWN_ORGS) + r')\b'
)


def clean_name(name: str) -> str:
    return NUMBER_PREFIX.sub("", name).strip()


def extract_orgs(text: str) -> list[str]:
    found = set(KNOWN_ORG_RE.findall(text))
    found.update(m.group(0).strip() for m in ORG_SUFFIX_RE.finditer(text[:2000]))
    return list(found)


def extract_text(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pdf":
        doc = fitz.open(str(path))
        return "\n".join(page.get_text() for page in doc)
    if ext in (".doc", ".docx"):
        if DOCX_OK:
            try:
                doc = python_docx.Document(str(path))
                return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            except Exception:
                pass
        # Fallback: docx2txt handles more edge cases and some old .doc files
        if DOCX2TXT_OK:
            try:
                return docx2txt.process(str(path)) or ""
            except Exception:
                pass
    return ""


def build_doc(path: Path, root: Path) -> dict:
    text = extract_text(path)

    
    parts        = path.relative_to(root).parts
    folder_parts = [truncate_at_dots(p) for p in parts[:-1]]  # keep numbers, strip dot-padding
    katigoria    = folder_parts[0] if folder_parts else "Αταξινόμητο"
    ypokatigoria = folder_parts[1:] if len(folder_parts) > 1 else []
    titlos       = truncate_at_dots(clean_name(path.stem))[:300]
    orgs         = extract_orgs(titlos + " " + text[:3000])

    return {
        "text":  text,   
        "doc": {
            "id":           str(uuid.uuid4()),
            "arithmos":     path.name,
            "titlos":       titlos,
            "katigoria":    katigoria,
            "ypokatigoria": ypokatigoria,
            "organismos":   orgs,
            "periexomeno":  text[:50_000],
            "pdf_path":     str(path.relative_to(root)).replace('\\', '/'),
        },
    }


def commit_batch(batch: list[dict], solr_url: str):
    httpx.post(
        f"{solr_url}/update/json/docs",
        params={"commit": "true"},
        json=batch,
        timeout=60,
    ).raise_for_status()


def crawl_and_index(dataset_root: Path, solr_url: str, batch_size: int = 20):
    all_files = [
        p for p in dataset_root.rglob("*")
        if p.is_file() and p.suffix.lower() in SUPPORTED
    ]
    print(f"Found {len(all_files)} files under {dataset_root}\n")

    batch: list[dict] = []
    indexed = 0
    skipped = 0

    for path in all_files:
        try:
            result = build_doc(path, dataset_root)

            if not result["text"].strip():
                print(f"  SKIP (no text): {path.name}")
                skipped += 1
                continue

            doc = result["doc"]
            batch.append(doc)
            cat_label = doc["katigoria"]
            if doc["ypokatigoria"]:
                cat_label += " > " + " > ".join(doc["ypokatigoria"])
            print(f"  [{cat_label}] {path.name}")

            if len(batch) >= batch_size:
                commit_batch(batch, solr_url)
                indexed += len(batch)
                print(f"  → committed {indexed} docs so far")
                batch = []

        except Exception as e:
            print(f"  ERROR {path.name}: {e}")
            skipped += 1

    if batch:
        commit_batch(batch, solr_url)
        indexed += len(batch)

    print(f"\nDone.  Indexed: {indexed}  |  Skipped: {skipped}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk index a dataset folder into Solr.")
    parser.add_argument("--dataset", required=True, help="Root folder of the dataset")
    parser.add_argument("--solr",    default=SOLR_URL,  help="Solr collection URL")
    parser.add_argument("--batch",   type=int, default=20, help="Docs per Solr commit")
    args = parser.parse_args()

    crawl_and_index(Path(args.dataset), args.solr, args.batch)
