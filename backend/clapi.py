from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.responses import FileResponse 
from fastapi.middleware.cors import CORSMiddleware
import httpx
import fitz
import uuid
import re
import json
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="CaseLaw API")
# app.mount("/pdf", StaticFiles(directory="pdf"), name="pdf")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SOLR_URL = "http://localhost:8983/solr/nomologia"

CATEGORY_FOLDERS = {
    "Διοικητικό": "dioikitiko",
    "Αστικό": "astiko",
    "Ποινικό": "poiniko",
    "Εμπορικό": "emporiko",
    "Εργατικό": "ergatiko",
    "Οικογενειακό": "oikogeneiako",
}

DIKASTIRIA = {
    "ΣτΕ":       "Συμβούλιο Επικρατείας",
    "ΑΠ":        "Άρειος Πάγος",
    "ΕφΑθ":      "Εφετείο Αθηνών",
    "ΕφΠειρ":    "Εφετείο Πειραιά",
    "ΠΠρ":       "Πρωτοδικείο Πειραιά",
    "ΜονΠρΑθ":   "Μονομελές Πρωτοδικείο Αθηνών",
    "ΜονΠρωτΑθ": "Μονομελές Πρωτοδικείο Αθηνών",
    "ΔΕΕ":       "Δικαστήριο ΕΕ",
    "ΕΔΔΑ":      "Ευρωπαϊκό Δικαστήριο Δικαιωμάτων",
}

HARDCODED_ABBREVIATIONS = ['ΣτΕ', 'ΑΠ', 'ΕφΑθ', 'ΕφΠειρ', 'ΠΠρ', 'ΜονΠρΑθ', 'ΜονΠρωτΑθ', 'ΔΕΕ', 'ΕΔΔΑ']

TMP_DIR = Path("temporary/cl_pdfs")
TMP_DIR.mkdir(parents=True, exist_ok=True)

PDF_DIR = Path("pdf")
PDF_DIR.mkdir(parents=True, exist_ok=True)

COURTS_FILE = Path("courts.json")
if not COURTS_FILE.exists():
    COURTS_FILE.write_text("[]", encoding="utf-8")

def _read_courts() -> list[dict]:
    return json.loads(COURTS_FILE.read_text(encoding="utf-8"))
# temporary function to build the regex pattern till i hardcode all courts in the pattern 
def _build_pattern() -> re.Pattern:
    extra = [c["abbreviation"] for c in _read_courts()]
    all_abbr = HARDCODED_ABBREVIATIONS + [a for a in extra if a not in HARDCODED_ABBREVIATIONS]
    alternation = '|'.join(re.escape(a) for a in all_abbr)
    return re.compile(
        rf'(Απόφαση\s+)?({alternation})\s+([\d.]+)/(\d{{4}})',
        re.UNICODE
    )

def _write_courts(data: list[dict]):
    COURTS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

class CourtIn(BaseModel):
    abbreviation: str
    full_name: str
    facet_label: str | None = None

class CourtUpdate(BaseModel):
    abbreviation: str | None = None
    full_name: str | None = None
    facet_label: str | None = None


def extract_text(pdf_path: Path) -> str:
    doc = fitz.open(str(pdf_path))
    return "\n".join(page.get_text() for page in doc)

def parse_metadata(text: str, filename: str) -> dict:
    pattern = _build_pattern()
    match = pattern.search(text[:500])

    if match:
        prefix     = match.group(2)
        number     = match.group(3)
        year       = int(match.group(4))
        arithmos   = f"{prefix} {number}/{year}"
        if prefix in DIKASTIRIA:
            dikastirio = DIKASTIRIA[prefix]
        else:
            court_map  = {c["abbreviation"]: c["full_name"] for c in _read_courts()}
            dikastirio = court_map.get(prefix, prefix)
    else:
        arithmos   = filename
        dikastirio = "N/A"
        year       = 0

    lines  = [l.strip() for l in text.split("\n") if l.strip()]

    # Title = lines from the 1st "Απόφαση <court> <number>" up to (not including) the 2nd occurrence
    match_indices = [i for i, line in enumerate(lines) if pattern.search(line)]
    if len(match_indices) >= 2:
        title_parts = lines[match_indices[0]:match_indices[1]]
    elif len(match_indices) == 1:
        title_parts = [lines[match_indices[0]]]
    else:
        title_parts = [lines[0]] if lines else [filename]

    titlos = " ".join(title_parts)[:300]

    return {
        "arithmos":   arithmos,
        "dikastirio": dikastirio,
        "etos":       year,
        "titlos":     titlos,
    }



@app.get("/")
def root():
    return {"message": "CaseLaw API is running"}


#  Courts abbreviations in json

@app.get("/api/courts")
def list_courts():
    return _read_courts()

@app.post("/api/courts", status_code=201)
def create_court(court: CourtIn):
    courts = _read_courts()
    new = {
        "id": str(uuid.uuid4()),
        "abbreviation": court.abbreviation,
        "full_name": court.full_name,
        "facet_label": court.facet_label or court.full_name,
    }
    courts.append(new)
    _write_courts(courts)
    return new

@app.patch("/api/courts/{court_id}")
def update_court(court_id: str, payload: CourtUpdate):
    courts = _read_courts()
    for c in courts:
        if c["id"] == court_id:
            if payload.abbreviation is not None:
                c["abbreviation"] = payload.abbreviation
            if payload.full_name is not None:
                c["full_name"] = payload.full_name
            if payload.facet_label is not None:
                c["facet_label"] = payload.facet_label
            _write_courts(courts)
            return c
    raise HTTPException(status_code=404, detail="Court not found")

@app.delete("/api/courts/{court_id}", status_code=204)
def delete_court(court_id: str):
    courts = _read_courts()
    filtered = [c for c in courts if c["id"] != court_id]
    if len(filtered) == len(courts):
        raise HTTPException(status_code=404, detail="Court not found")
    _write_courts(filtered)


# TODO: Reconsider the way the PDFs are stored and indexed (katigoria part, should probably be changed to dikastirio, and maybe etos so it can be more automated)
@app.post("/api/index")
async def index_pdf(
    file: UploadFile = File(...),
    katigoria: list[str] = Query(default=["Αταξινόμητο"])
):
    base_name = Path(file.filename).name
    primary_cat = katigoria[0] if katigoria else "Αταξινόμητο"
    category_folder = CATEGORY_FOLDERS.get(primary_cat, primary_cat.lower())
    dest_dir = TMP_DIR / category_folder
    dest_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = dest_dir / base_name
    tmp_path.write_bytes(await file.read())

    try:
        text = extract_text(tmp_path)
        meta = parse_metadata(text, tmp_path.stem)

        doc = {
            "id":          str(uuid.uuid4()),
            "arithmos":    meta["arithmos"],
            "dikastirio":  meta["dikastirio"],
            "etos":        meta["etos"],
            "titlos":      meta["titlos"],
            "periexomeno": text[:50_000],
            "katigoria":   katigoria,
            "pdf_path":    base_name,
        }

        resp = httpx.post(
            f"{SOLR_URL}/update/json/docs",
            params={"commit": "true"},
            json=doc
        )
        resp.raise_for_status()

        return {
            "status":     "ok",
            "arithmos":   meta["arithmos"],
            "dikastirio": meta["dikastirio"],
            "etos":       meta["etos"],
        }

    except Exception as e:
        tmp_path.unlink(missing_ok=True)
        return {"status": "error", "detail": str(e)}


@app.get("/api/search")
async def search(
    q: str = "*",
    dikastirio: list[str] = Query(default=None),
    etos: list[int] = Query(default=None),
    katigoria: list[str] = Query(default=None),
    page: int = 0,
    rows: int = 10,
):
    fq = []
    if dikastirio:
        fq.append('dikastirio:(' + ' OR '.join(f'"{d}"' for d in dikastirio) + ')')
    if etos:
        fq.append('etos:(' + ' OR '.join(str(e) for e in etos) + ')')
    if katigoria:
        fq.append('katigoria:(' + ' OR '.join(f'"{k}"' for k in katigoria) + ')')

    # Build Solr query
    solr_q = q.strip()
    if not solr_q or solr_q == "*":
        solr_q = "*:*"

    params = {
        "q":              solr_q,
        "defType":        "edismax",
        "qf":             "titlos^3 arithmos^5 periexomeno",
        "hl":             "true",
        "hl.fl":          "periexomeno",
        "hl.snippets":    3,
        "hl.fragsize":    200,
        "hl.simple.pre":  "<mark>",
        "hl.simple.post": "</mark>",
        "facet":          "true",
        "facet.field":    ["dikastirio", "etos", "katigoria"],
        "fq":             fq,
        "start":          page * rows,
        "rows":           rows,
        "wt":             "json",
    }

    resp = httpx.get(f"{SOLR_URL}/select", params=params)
    resp.raise_for_status()
    data = resp.json()

    return {
        "total":      data["response"]["numFound"],
        "results":    data["response"]["docs"],
        "highlights": data.get("highlighting", {}),
        "facets":     data.get("facet_counts", {}).get("facet_fields", {}),
    }


@app.get("/api/facets")
async def get_facets():
    """Return all available filter values (katigoria, dikastirio, etos) from Solr."""
    params = {
        "q":           "*:*",
        "rows":        0,
        "facet":       "true",
        "facet.field": ["dikastirio", "etos", "katigoria"],
        "facet.limit": -1,
        "facet.mincount": 1,
        "wt":          "json",
    }
    resp = httpx.get(f"{SOLR_URL}/select", params=params)
    resp.raise_for_status()
    facet_fields = resp.json().get("facet_counts", {}).get("facet_fields", {})

    def parse_pairs(flat_list):
        return {flat_list[i]: flat_list[i + 1] for i in range(0, len(flat_list), 2)}

    return {
        "katigoria":  parse_pairs(facet_fields.get("katigoria", [])),
        "dikastirio": parse_pairs(facet_fields.get("dikastirio", [])),
        "etos":       parse_pairs(facet_fields.get("etos", [])),
    }


@app.get("/api/cases/{case_id}")
async def get_case(case_id: str):
    resp = httpx.get(f"{SOLR_URL}/select", params={
        "q":  f"id:{case_id}",
        "wt": "json"
    })
    docs = resp.json()["response"]["docs"]
    if not docs:
        return {"status": "error", "detail": "Not found"}
    return docs[0]

@app.patch("/api/cases/{case_id}")
async def update_case(case_id: str, payload: dict):
    """Update specific fields of an indexed document (titlos, dikastirio, etos, katigoria)."""
    get_resp = httpx.get(f"{SOLR_URL}/select", params={"q": f"id:{case_id}", "wt": "json"})
    get_resp.raise_for_status()
    docs = get_resp.json()["response"]["docs"]
    if not docs:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = docs[0]
    allowed_fields = {"titlos", "dikastirio", "etos", "katigoria", "arithmos"}
    updated = False
    for field, value in payload.items():
        if field in allowed_fields:
            doc[field] = value
            updated = True

    if not updated:
        raise HTTPException(status_code=400, detail="No valid fields to update.")

    for internal in ("_version_", "_root_", "score"):
        doc.pop(internal, None)

    resp = httpx.post(
        f"{SOLR_URL}/update/json/docs",
        params={"commit": "true"},
        json=doc,
    )
    resp.raise_for_status()
    return {"status": "ok", "id": case_id}


@app.delete("/api/cases/{case_id}")
async def delete_case(case_id: str):
    """Remove a document from the Solr index by its ID."""
    resp = httpx.post(
        f"{SOLR_URL}/update",
        params={"commit": "true"},
        json={"delete": {"id": case_id}},
        headers={"Content-Type": "application/json"},
    )
    resp.raise_for_status()
    return {"status": "ok", "deleted": case_id}


@app.get("/pdf/{katigoria}/{filename:path}")
async def serve_pdf(katigoria: str, filename: str):
    base_name = Path(filename).name
    folder_name = CATEGORY_FOLDERS.get(katigoria, katigoria)

    # 1. Check temp folder first (uploaded via admin panel)
    tmp_cat_path = TMP_DIR / folder_name / base_name
    if tmp_cat_path.exists() and tmp_cat_path.is_file():
        return FileResponse(tmp_cat_path, media_type="application/pdf")

    for fallback_path in TMP_DIR.rglob(base_name):
        if fallback_path.is_file():
            return FileResponse(fallback_path, media_type="application/pdf")

    # 2. Fall back to pdf/ folder (indexed via indexer.py)
    base_folder = Path("pdf")
    exact_path = base_folder / folder_name / base_name
    if exact_path.exists() and exact_path.is_file():
        return FileResponse(exact_path, media_type="application/pdf")

    if base_folder.exists():
        for fallback_path in base_folder.rglob(base_name):
            if fallback_path.is_file():
                return FileResponse(fallback_path, media_type="application/pdf")

    raise HTTPException(status_code=404, detail=f"Το αρχείο {base_name} δεν βρέθηκε στον δίσκο.")