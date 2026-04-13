from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.responses import FileResponse 
from fastapi.middleware.cors import CORSMiddleware
import httpx
import fitz
import uuid
import re
from pathlib import Path
from fastapi.staticfiles import StaticFiles

# TODO: Clean Up the Code(kinda did?).
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

ARITHMOS_PATTERN = re.compile(
    r'(Απόφαση\s+)?(ΣτΕ|ΑΠ|ΕφΑθ|ΕφΠειρ|ΠΠρ|ΜονΠρΑθ|ΜονΠρωτΑθ|ΔΕΕ|ΕΔΔΑ)\s+([\d.]+)/(\d{4})',
    re.UNICODE
)

TMP_DIR = Path("temporary/cl_pdfs")
TMP_DIR.mkdir(parents=True, exist_ok=True)




def extract_text(pdf_path: Path) -> str:
    doc = fitz.open(str(pdf_path))
    return "\n".join(page.get_text() for page in doc)

def parse_metadata(text: str, filename: str) -> dict:
    match = ARITHMOS_PATTERN.search(text[:500])

    if match:
        prefix     = match.group(2)
        number     = match.group(3)
        year       = int(match.group(4))
        arithmos   = f"{prefix} {number}/{year}"
        dikastirio = DIKASTIRIA.get(prefix, prefix)
    else:
        arithmos   = filename
        dikastirio = "N/A"
        year       = 0

    lines  = [l.strip() for l in text.split("\n") if l.strip()]

    # Title = lines from the 1st "Απόφαση <court> <number>" up to (not including) the 2nd occurrence
    match_indices = [i for i, line in enumerate(lines) if ARITHMOS_PATTERN.search(line)]
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

# TODO: Add a Dev Account Login with MFA and a Dashboard to See Uploaded PDFs, Search Queries, and Analytics
# TODO: Reconsider the way the PDFs are stored and indexed (katigoria part, should probably be changed to dikastirio, and maybe etos so it can be more automated)
# FIXME: fix the title extraction, cause sometimes its not only one line, and sometimes its not the first line
@app.post("/api/index")
async def index_pdf(
    file: UploadFile = File(...),
    katigoria: list[str] = Query(default=["Αταξινόμητο"])
):
    tmp_path = TMP_DIR / file.filename
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
            "pdf_path":    file.filename,
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
        return {"status": "error", "detail": str(e)}

    finally:
        tmp_path.unlink(missing_ok=True) 


@app.get("/api/search")
async def search(
    q: str,
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

    params = {
        "q":              q,
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

@app.get("/pdf/{katigoria}/{filename}")
async def serve_pdf(katigoria: str, filename: str):
    # Ο κεντρικός σου φάκελος λέγεται ακριβώς "pdf"
    base_folder = Path("pdf") 
    
    # Το FastAPI παίρνει τη λέξη "Διοικητικό" και το λεξικό την κάνει "dioikitiko"
    folder_name = CATEGORY_FOLDERS.get(katigoria, katigoria)
    
    # Χτίζουμε την ακριβή διαδρομή: π.χ. pdf / dioikitiko / test1.pdf
    exact_path = base_folder / folder_name / filename
    
    # 1. Προσπάθεια: Το βρίσκει αστραπιαία στον σωστό υποφάκελο
    if exact_path.exists() and exact_path.is_file():
        return FileResponse(exact_path, media_type="application/pdf")
        
    # 2. Δίχτυ Ασφαλείας: Αν κάποιο PDF μπήκε σε λάθος φάκελο, ψάχνει σε ΟΛΟΥΣ τους φακέλους
    if base_folder.exists():
        for fallback_path in base_folder.rglob(filename):
            if fallback_path.is_file():
                return FileResponse(fallback_path, media_type="application/pdf")
                
    # 3. Τελικό σφάλμα αν δεν υπάρχει πουθενά
    raise HTTPException(status_code=404, detail=f"Το αρχείο {filename} δεν βρέθηκε στον δίσκο.")