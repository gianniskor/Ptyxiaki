from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import AsyncIterator
import os
import httpx
import fitz
import uuid
import re
from urllib.parse import unquote
from pathlib import Path
from pydantic import BaseModel

app = FastAPI(title="CaseLaw API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SOLR_URL     = os.environ["SOLR_URL"]


LM_STUDIO_URL   = os.environ["LM_STUDIO_URL"]
LM_STUDIO_MODEL = os.environ["LM_STUDIO_MODEL"]
DATASET_DIR = Path(os.environ["DATASET_DIR"])

TMP_DIR = Path("temporary/cl_pdfs")
TMP_DIR.mkdir(parents=True, exist_ok=True)

NUMBER_PREFIX = re.compile(r"^\d+\.?\d*[\s.\-]+")


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


def extract_text(pdf_path: Path) -> str:
    doc = fitz.open(str(pdf_path))
    return "\n".join(page.get_text() for page in doc)



@app.get("/")
def root():
    return {"message": "CaseLaw API is running"}


@app.post("/api/index")
async def index_pdf(
    file: UploadFile = File(...),
    katigoria: str = Query(default="Αταξινόμητο"),
    ypokatigoria: list[str] = Query(default=[]),
):
    base_name = Path(file.filename).name
    dest_dir = TMP_DIR / "uploads"
    dest_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = dest_dir / base_name
    tmp_path.write_bytes(await file.read())

    try:
        text = extract_text(tmp_path)
        titlos = clean_name(Path(base_name).stem)[:300]
        orgs = extract_orgs(titlos + " " + text[:3000])

        doc = {
            "id":           str(uuid.uuid4()),
            "arithmos":     base_name,
            "titlos":       titlos,
            "katigoria":    katigoria,
            "ypokatigoria": ypokatigoria,
            "organismos":   orgs,
            "periexomeno":  text[:50_000],
            "pdf_path":     base_name,
        }

        resp = httpx.post(
            f"{SOLR_URL}/update/json/docs",
            params={"commit": "true"},
            json=doc,
        )
        resp.raise_for_status()

        return {
            "status":    "ok",
            "titlos":    titlos,
            "katigoria": katigoria,
            "organismos": orgs,
        }

    except Exception as e:
        tmp_path.unlink(missing_ok=True)
        return {"status": "error", "detail": str(e)}


@app.get("/api/search")
async def search(
    q: str = "*",
    organismos: list[str] = Query(default=None),
    katigoria: list[str] = Query(default=None),
    ypokatigoria: list[str] = Query(default=None),
    page: int = 0,
    rows: int = 10,
):
    fq = []
    if organismos:
        fq.append('organismos:(' + ' OR '.join(f'"{o}"' for o in organismos) + ')')
    if katigoria:
        fq.append('katigoria:(' + ' OR '.join(f'"{k}"' for k in katigoria) + ')')
    if ypokatigoria:
        fq.append('ypokatigoria:(' + ' OR '.join(f'"{y}"' for y in ypokatigoria) + ')')

    solr_q = q.strip()
    if not solr_q or solr_q == "*":
        solr_q = "*:*"

    params = {
        "q":              solr_q,
        "defType":        "edismax",
        "qf":             "titlos^3 periexomeno katigoria^2 ypokatigoria^2 organismos^2",
        "hl":             "true",
        "hl.fl":          "periexomeno",
        "hl.snippets":    3,
        "hl.fragsize":    200,
        "hl.simple.pre":  "<mark>",
        "hl.simple.post": "</mark>",
        "facet":          "true",
        "facet.field":    ["katigoria", "ypokatigoria", "organismos"],
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
    params = {
        "q":              "*:*",
        "rows":           0,
        "facet":          "true",
        "facet.field":    ["katigoria", "ypokatigoria", "organismos"],
        "facet.limit":    -1,
        "facet.mincount": 1,
        "wt":             "json",
    }
    resp = httpx.get(f"{SOLR_URL}/select", params=params)
    resp.raise_for_status()
    facet_fields = resp.json().get("facet_counts", {}).get("facet_fields", {})

    def parse_pairs(flat_list):
        return {flat_list[i]: flat_list[i + 1] for i in range(0, len(flat_list), 2)}

    return {
        "katigoria":    parse_pairs(facet_fields.get("katigoria", [])),
        "ypokatigoria": parse_pairs(facet_fields.get("ypokatigoria", [])),
        "organismos":   parse_pairs(facet_fields.get("organismos", [])),
    }


@app.get("/api/hierarchy")
async def get_hierarchy():
    """Return katigoria → [ypokatigoria, ...] mapping using facet pivot."""
    params = {
        "q":              "*:*",
        "rows":           0,
        "facet":          "true",
        "facet.pivot":    "katigoria,ypokatigoria",
        "facet.limit":    -1,
        "facet.mincount": 1,
        "wt":             "json",
    }
    resp = httpx.get(f"{SOLR_URL}/select", params=params)
    resp.raise_for_status()
    pivot_data = resp.json().get("facet_counts", {}).get("facet_pivot", {})
    result: dict[str, list[str]] = {}
    for cat_entry in pivot_data.get("katigoria,ypokatigoria", []):
        cat  = cat_entry["value"]
        subs = [s["value"] for s in cat_entry.get("pivot", [])]
        result[cat] = subs
    return result


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
    allowed_fields = {"titlos", "katigoria", "ypokatigoria", "organismos", "arithmos"}
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


class RagQuery(BaseModel):
    query: str
    top_k: int = 5
    katigoria: list[str] = []
    ypokatigoria: list[str] = []


@app.post("/api/rag")
async def rag_endpoint(body: RagQuery):
    """Retrieve top-K docs from Solr then generate an answer via Ollama/Qwen."""
    # ── 1. Retrieve from Solr ───────────────────────────────────────────────
    fq = []
    if body.katigoria:
        fq.append('katigoria:(' + ' OR '.join(f'"{k}"' for k in body.katigoria) + ')')
    if body.ypokatigoria:
        fq.append('ypokatigoria:(' + ' OR '.join(f'"{y}"' for y in body.ypokatigoria) + ')')

    solr_params = {
        "q":              body.query,
        "defType":        "edismax",
        "qf":             "titlos^3 periexomeno katigoria^2",
        "rows":           body.top_k,
        "fl":             "id,titlos,katigoria",
        "fq":             fq,
        "wt":             "json",
        # Highlighting
        "hl":             "true",
        "hl.fl":          "periexomeno",
        "hl.snippets":    3,
        "hl.fragsize":    300,
        "hl.simple.pre":  "",
        "hl.simple.post": "",
    }
    solr_resp = httpx.get(f"{SOLR_URL}/select", params=solr_params, timeout=15)
    solr_resp.raise_for_status()
    solr_json  = solr_resp.json()
    docs       = solr_json["response"]["docs"]
    highlights = solr_json.get("highlighting", {})

    if not docs:
        return {"answer": "Δεν βρέθηκαν σχετικά έγγραφα για την ερώτησή σας.", "sources": []}

    # ── 2. Build context from highlighting snippets ─────────────────────────
    context_parts = []
    for i, doc in enumerate(docs, 1):
        hl_snippets = highlights.get(doc["id"], {}).get("periexomeno", [])
        snippet     = " … ".join(hl_snippets).strip() if hl_snippets else ""
        cat         = ", ".join(doc.get("katigoria") or [])
        context_parts.append(
            f"ΠΗΓΗ [{i}] | Τίτλος: {doc.get('titlos', '')} | Κατηγορία: {cat}\n{snippet}"
        )
    context = "\n\n---\n\n".join(context_parts)

    system_msg = (
        "Είσαι αυστηρός νομικός βοηθός. Κανόνες:\n"
        "1. Απάντα ΜΟΝΟ βάσει των παρεχόμενων αποσπασμάτων — μην χρησιμοποιείς εξωτερική γνώση.\n"
        "2. Αν δεν υπάρχει επαρκής πληροφορία, απάντα ακριβώς: «Δεν βρέθηκε απάντηση».\n"
        "3. Παράθεσε πηγές χρησιμοποιώντας αγκύλες, π.χ. [1], [2].\n"
        "4. Απάντα πάντα στα Ελληνικά."
    )
    user_msg = (
        f"ΑΠΟΣΠΑΣΜΑΤΑ:\n{context}\n\n"
        f"ΕΡΩΤΗΣΗ: {body.query}\n\n"
        "ΑΠΑΝΤΗΣΗ:"
    )

    # ── 3. Call Ollama ──────────────────────────────────────────────────────
    ollama_resp = httpx.post(
        f"{LM_STUDIO_URL}/chat/completions",
        json={
            "model":  LM_STUDIO_MODEL,
            "stream": False,
            "temperature": 0.3,
            "frequency_penalty": 1.1,
            "top_p": 0.5,
            "max_tokens": 4096,
            "enable_thinking": True,
            "messages": [
                {"role": "system", "content": system_msg},
                {"role": "user",   "content": user_msg},
            ],
        },
        timeout=120,
    )
    ollama_resp.raise_for_status()
    answer = ollama_resp.json()["choices"][0]["message"]["content"]

    sources = [
        {"titlos": d.get("titlos", ""), "katigoria": d.get("katigoria", [])}
        for d in docs
    ]
    return {"answer": answer, "sources": sources}


# ──────────────────────────────────────────────────────────────────────────────
# FACT-CHECK  (streaming, multi-step RAG)
# ──────────────────────────────────────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class FactCheckQuery(BaseModel):
    text: str
    top_k: int = 5
    katigoria: list[str] = []
    ypokatigoria: list[str] = []
    history: list[HistoryMessage] = []


@app.post("/api/fact-check")
async def fact_check_endpoint(body: FactCheckQuery):
    """Multi-step RAG fact-checker that streams the final verdict word-by-word."""

    async with httpx.AsyncClient(timeout=120) as client:

        # ── Step 1: Keyword extraction via LM Studio ──────────────────────────
        sys_prompt_kw = (
            "Είσαι ένας αυστηρός αλγόριθμος εξαγωγής όρων αναζήτησης (Search Query Generator). "
            "Μην κάνεις ανάλυση, μην κάνεις reasoning, μην γράφεις τίποτα άλλο εκτός από τις λέξεις-κλειδιά. "
            "Οφείλεις να επιστρέφεις ΜΟΝΟ έως 8 λέξεις-κλειδιά, χωρισμένες με κενό."
            ""
        )
        
        user_prompt_kw = (
            "Μετάτρεψε την παρακάτω ερώτηση σε λέξεις-κλειδιά για νομική/τεχνική αναζήτηση.\n"
            "ΑΥΣΤΗΡΟΙ ΚΑΝΟΝΕΣ:\n"
            "1. ΔΙΕΓΡΑΨΕ εντελώς ρήματα, άρθρα, προθέσεις και αντωνυμίες (π.χ. θέλω, να, μου, πώς, τι).\n"
            "2. ΜΕΤΑΤΡΕΨΕ τις λέξεις στις αντίστοιχες συνώνυμες στα νέα ελληνικά.\n"
            "3. ΑΠΑΓΟΡΕΥΕΤΑΙ να προσθέσεις δικές σου έννοιες που δεν υπάρχουν στο κείμενο.\n"
            "4. ΜΗΝ δικαιολογείς την απάντησή σου. Γράψε ΜΟΝΟ τις λέξεις.\n\n"
            f"Ερώτηση χρήστη: '{body.text}'\n"
            "Λέξεις-Κλειδιά:\n"
        )

        kw_resp = await client.post(
            f"{LM_STUDIO_URL}/chat/completions",
            json={
                "model":  LM_STUDIO_MODEL,
                "stream": False,
                "temperature": 0.0,
                "top_p": 0.5,
                "frequency_penalty": 1.2,
                # "presence_penalty": 0.0,
                "max_tokens": 4000,
                "enable_thinking": False,
                "messages": [
                    {"role": "system", "content": sys_prompt_kw},
                    {"role": "user",   "content": user_prompt_kw},
                ],
            },
        )
        kw_resp.raise_for_status()
        keywords = kw_resp.json()["choices"][0]["message"]["content"].strip()
        print(keywords)

        # ── Step 2: Solr retrieval with highlighting ───────────────────────
        fq = []
        if body.katigoria:
            fq.append('katigoria:(' + ' OR '.join(f'"{k}"' for k in body.katigoria) + ')')
        if body.ypokatigoria:
            fq.append('ypokatigoria:(' + ' OR '.join(f'"{y}"' for y in body.ypokatigoria) + ')')

        solr_resp = await client.get(
            f"{SOLR_URL}/select",
            params={
                "q":              keywords,
                "defType":        "edismax",
                "qf":             "titlos^3 periexomeno",
                "rows":           body.top_k,
                "fl":             "id,titlos,katigoria,periexomeno,pdf_path,arithmos",
                "fq":             fq,
                "wt":             "json",
                "hl":             "true",
                "hl.fl":          "periexomeno",
                "hl.snippets":    3,
                "hl.fragsize":    300,
                "hl.simple.pre":  "",
                "hl.simple.post": "",
            },
        )
        solr_resp.raise_for_status()
        solr_json  = solr_resp.json()
        docs = solr_json["response"]["docs"]
        highlights = solr_json.get("highlighting", {})

        if not docs:
            async def no_docs() -> AsyncIterator[str]:
                yield "Δεν βρέθηκαν σχετικά έγγραφα για έλεγχο."
            return StreamingResponse(no_docs(), media_type="text/plain")

        # Build context string με δικλείδα ασφαλείας (Fallback)
        context_parts: list[str] = []
        source_meta: list[dict] = []
        for i, doc in enumerate(docs, 1):
            doc_id = doc["id"]
            hl_snippets = highlights.get(doc_id, {}).get("periexomeno", [])
            
            if hl_snippets:
                # Αν υπάρχουν highlights, χρησιμοποίησέ τα
                snippet = " … ".join(hl_snippets).strip()
            else:
                # FALLBACK: Αν το highlight είναι άδειο, πάρε την αρχή του κειμένου
                raw_content = doc.get("periexomeno", "")
                if isinstance(raw_content, list):
                    raw_content = " ".join(raw_content)
                snippet = raw_content[:1000].strip() + " [Πλήρες κείμενο - Δεν βρέθηκαν αποσπάσματα]"

            context_parts.append(
                f"ΠΗΓΗ [{i}] | Τίτλος: {doc.get('titlos', 'Άγνωστος Τίτλος')}\n"
                f"Κείμενο: {snippet}"
            )

            # Μετα-δεδομένα πηγής για το frontend (μονή γραμμή, χωρίς να σπάει το footer parsing)
            preview = re.sub(r"\s+", " ", snippet).strip()
            pdf_val = doc.get("pdf_path") or doc.get("arithmos") or ""
            if isinstance(pdf_val, list):
                pdf_val = pdf_val[0] if pdf_val else ""
            title_val = doc.get("titlos", "Άγνωστη πηγή")
            if isinstance(title_val, list):
                title_val = " ".join(title_val)
            source_meta.append({
                "title":    title_val,
                "snippet":  preview[:300],
                "pdf_path": str(pdf_val),
            })
            
        context = "\n\n---\n\n".join(context_parts)
        
        # ΕΚΤΥΠΩΣΗ ΓΙΑ DEBUGGING: Δες στο τερματικό της Python τι στέλνεις στο LLM!
        print("====== CONTEXT SENT TO QWEN ======")
        print(context)
        print("==================================")

        # ── Step 3 & 4: Streaming fact-check via Ollama ────────────────────
        system_msg = (
            "Είσαι νομικός βοηθός. Απάντα ΠΑΝΤΑ στα Ελληνικά. "
            "Χρησιμοποίησε ΜΟΝΟ τις πηγές που σου δίνονται. "
            "Παράθεσε παραπομπές π.χ. [1], [2]. "
            "Αν οι πηγές έχουν μερική πληροφορία, χρησιμοποίησέ την — μην αρνείσαι να απαντήσεις. "
            "Απάντησε απευθείας, χωρίς να αναλύεις τη σκέψη σου ή να γράφεις ενδιαφέροντα βήματα ανάλυσης."
        )
        user_msg = (
            f"ΕΡΩΤΗΣΗ: {body.text}\n\n"
            f"ΠΗΓΕΣ:\n{context}\n\n"
            "Απάντησε βάσει των πηγών:"
        )

        # Collect sources footer, μορφή ανά γραμμή: "[i] τίτλος|@|snippet|@|pdf_path|@|keywords"
        kw_clean = re.sub(r"\s+", " ", keywords.replace("|", " ")).strip()
        sources_footer = "\n\n**Πηγές:**\n" + "\n".join(
            f"[{i}] {m['title']}|@|{m['snippet']}|@|{m['pdf_path']}|@|{kw_clean}"
            for i, m in enumerate(source_meta, 1)
        )

        # Build messages list with conversation history (last 6 turns max)
        MAX_HISTORY_TURNS = 6
        history_slice = body.history[-(MAX_HISTORY_TURNS * 2):]
        llm_messages = [{"role": "system", "content": system_msg}]
        for h in history_slice:
            if h.role in ("user", "assistant"):
                llm_messages.append({"role": h.role, "content": h.content})
        llm_messages.append({"role": "user", "content": user_msg})

        async def stream_ollama() -> AsyncIterator[str]:
            async with httpx.AsyncClient(timeout=180) as stream_client:
                async with stream_client.stream(
                    "POST",
                    f"{LM_STUDIO_URL}/chat/completions",
                    json={
                        "model":  LM_STUDIO_MODEL,
                        "stream": True,
                        "temperature": 0.3,
                        "top_p": 0.5,
                        "max_tokens": 8000,
                        "enable_thinking": True,
                        "messages": llm_messages,
                    },
                ) as resp:
                    import json as _json
                    in_think = False
                    think_closed = False
                    async for raw_line in resp.aiter_lines():
                        if raw_line.startswith("data: "):
                            data_str = raw_line[6:].strip()
                            
                            if data_str == "[DONE]":
                                break
                                
                            try:
                                chunk = _json.loads(data_str)
                                delta = chunk["choices"][0].get("delta", {})
                                reasoning = delta.get("reasoning_content") or delta.get("reasoning") or ""
                                token = delta.get("content") or ""

                                if reasoning:
                                    if not in_think:
                                        yield "<think>"
                                        in_think = True
                                    yield reasoning

                                if token:
                                    if in_think and not think_closed:
                                        yield "</think>"
                                        think_closed = True
                                    yield token
                            except (ValueError, IndexError, KeyError):
                                continue

                    if in_think and not think_closed:
                        yield "</think>"
                                
            yield sources_footer

        return StreamingResponse(stream_ollama(), media_type="text/plain")


@app.get("/pdf/{filename:path}")
async def serve_pdf(filename: str):
    decoded = unquote(filename).lstrip("/\\")
    rel = Path(decoded)

    # 1. Full relative path inside dataset
    full_path = DATASET_DIR / rel
    if full_path.exists() and full_path.is_file():
        return FileResponse(full_path, media_type="application/pdf")

    # 2. Search by filename only inside dataset (handles encoding mismatches)
    for match in DATASET_DIR.rglob(rel.name):
        if match.is_file():
            return FileResponse(match, media_type="application/pdf")

    # 3. Fallback: uploaded files in temp dir
    for match in TMP_DIR.rglob(rel.name):
        if match.is_file():
            return FileResponse(match, media_type="application/pdf")

    raise HTTPException(status_code=404, detail=f"Αρχείο δεν βρέθηκε: {filename}")