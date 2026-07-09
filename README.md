# CaseLaw : Legal & Technical Document Search Platform

CaseLaw is a full-stack search platform for Greek legal and technical documents.
It combines a fast full-text search engine (Apache Solr), a Python API for
indexing and retrieval, a modern Next.js frontend, Supabase authentication, and
an AI assistant (RAG chatbot) powered by a local LLM.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start (Docker — recommended)](#quick-start-docker--recommended)
- [Environment Variables](#environment-variables)
- [Where do I get the secrets?](#where-do-i-get-the-secrets)
- [Database Setup (Supabase Schema)](#database-setup-supabase-schema)
- [Indexing Documents](#indexing-documents)
- [Local Development (without Docker)](#local-development-without-docker)
- [Deploying to Production](#deploying-to-production)
- [Custom Domain](#custom-domain)
- [SMTP (Email) with Resend](#smtp-email-with-resend)
- [Google OAuth](#google-oauth)
- [Assigning the Admin Role](#assigning-the-admin-role)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Frontend   │────▶│   Backend    │─────▶│    Solr      │
│  Next.js     │      │  FastAPI     │      │  full-text   │
│  (port 3000) │      │  (port 8000) │      │  (port 8983) │
└──────┬───────┘      └──────┬───────┘      └──────────────┘
       │                     │
       ▼                     ▼
┌──────────────┐      ┌──────────────┐
│   Supabase   │      │  LM Studio   │
│ auth + DB    │      │  local LLM   │
│  (hosted)    │      │ (OpenAI API) │
└──────────────┘      └──────────────┘
```

- **Frontend** — Next.js app (search UI, admin dashboard, AI chatbot).
- **Backend** — FastAPI service that indexes documents into Solr and serves
  search, facets, PDF streaming and the RAG fact-check endpoint.
- **Solr** — Apache Solr core (`nomologia`) holding the searchable index.
- **Supabase** — hosted authentication and user/organisation database.
- **LM Studio** — any OpenAI-compatible LLM server used by the AI assistant.

---

## Tech Stack

| Layer      | Technology                              |
| ---------- | --------------------------------------- |
| Frontend   | Next.js 15, React 19, Tailwind CSS, HeroUI |
| Backend    | Python 3.12, FastAPI, PyMuPDF           |
| Search     | Apache Solr                             |
| Auth / DB  | Supabase                                |
| AI / LLM   | LM Studio (OpenAI-compatible API)       |
| Deployment | Docker & Docker Compose                 |

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- A free [Supabase](https://supabase.com) project (for authentication)
- An OpenAI-compatible LLM server such as
  [LM Studio](https://lmstudio.ai) *(optional — only needed for the AI assistant)*

---

## Quick Start (Docker — recommended)

> **The goal:** after cloning, you only need to fill in a few secrets in a
> single `.env` file, add your document dataset, and run one command.

**1. Clone the repository**

```bash
git clone https://github.com/gianniskor/Ptyxiaki.git
cd Ptyxiaki
```

**2. Create your environment file**

```bash
cp .env.example .env
```

Open `.env` and fill in the values (see [Environment Variables](#environment-variables)).
For a **local run** you only need to add your Supabase public keys — the defaults for
everything else work out of the box.

**2b. Create the Docker secret for the service-role key**

The `SUPABASE_SERVICE_ROLE_KEY` is handled as a **Docker secret** (not an env var).
Create the secrets directory and paste your key inside:

```bash
# Windows (PowerShell)
New-Item -ItemType Directory -Force secrets
"YOUR_SUPABASE_SERVICE_ROLE_KEY" | Out-File -NoNewline secrets\supabase_service_role_key.txt

# macOS / Linux
mkdir -p secrets
printf '%s' 'YOUR_SUPABASE_SERVICE_ROLE_KEY' > secrets/supabase_service_role_key.txt
```

> The `secrets/` directory is git-ignored — it will **never** be committed.

**3. Add your documents**

Place your source documents inside the `Dataset/` folder (kept out of git).
See [Indexing Documents](#indexing-documents) below.

**4. Start everything**

```bash
docker compose up --build
```

**5. Open the app**

- Frontend: <http://localhost:3000>
- Backend API docs: <http://localhost:8000/docs>
- Solr admin: <http://localhost:8983>

---

## Environment Variables

All configuration lives in a single **`.env`** file at the repository root
(loaded automatically by Docker Compose). Copy `.env.example` and fill it in.

| Variable                              | Required | Exposed to browser | Description                                                                 |
| ------------------------------------- | :------: | :----------------: | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`                 |    ✔     |        Yes         | Public URL of the backend API. Local: `http://localhost:8000`. Prod: your public backend URL. |
| `NEXT_PUBLIC_SUPABASE_URL`            |    ✔     |        Yes         | Supabase project URL.                                                       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`|    ✔     |        Yes         | Supabase publishable / anon key.                                            |
| `SUPABASE_SERVICE_ROLE_KEY`           |    ✔     |   **No — secret**  | Supabase service-role key. **Not in `.env`** — stored as a Docker secret in `secrets/supabase_service_role_key.txt` (see [Docker secrets](#docker-secrets--supabase-service-role-key)). |
| `LM_STUDIO_URL`                       | optional |         No         | OpenAI-compatible LLM endpoint. Default: `http://host.docker.internal:1234/v1`. |
| `LM_STUDIO_MODEL`                     | optional |         No         | Model name served by LM Studio.                                             |

> **Making it production-ready:** the only value most deployments need to change
> is **`NEXT_PUBLIC_API_URL`** — point it at the public URL of your backend and
> the frontend is ready to go. Because `NEXT_PUBLIC_*` values are baked into the
> client bundle at build time, Docker Compose passes them as build args
> automatically — just set them in `.env` **before** running `docker compose up --build`.

---

## Where do I get the secrets?

You do **not** commit any secret to the repository. Instead, every person who
clones the project creates their own local `.env` from `.env.example`.

### Supabase keys

1. Create a project at <https://supabase.com>.
2. Go to **Project Settings → API**.
3. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable / anon key** → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **service_role key** (click *Reveal*) → `SUPABASE_SERVICE_ROLE_KEY`

### Docker secrets — Supabase service-role key

**The service-role key has full admin access to your database and must never
appear in `.env`, in git, or in container environment variables.**

This project uses **Docker secrets** to deliver the key securely to the
frontend container at runtime. The key is mounted inside the container at
`/run/secrets/supabase_service_role_key` and read directly by the server-side
Next.js route handler — it is never exposed to the browser.

**Setup steps:**

1. Obtain the key from **Supabase → Project Settings → API → service_role** (click *Reveal*).
2. Create the secrets file (run once, after cloning):

   ```bash
   # Windows (PowerShell)
   New-Item -ItemType Directory -Force secrets
   "YOUR_SUPABASE_SERVICE_ROLE_KEY" | Out-File -NoNewline secrets\supabase_service_role_key.txt

   # macOS / Linux
   mkdir -p secrets
   printf '%s' 'YOUR_SUPABASE_SERVICE_ROLE_KEY' > secrets/supabase_service_role_key.txt
   ```

3. The `secrets/` directory is listed in `.gitignore` — it will **never** be committed.

> **Important:** Do **not** put the service-role key in `.env` or any tracked file.
> If you previously had `SUPABASE_SERVICE_ROLE_KEY=...` in your `.env`, remove it.

#### How it works

```
docker compose up
    └── mounts secrets/supabase_service_role_key.txt
             → /run/secrets/supabase_service_role_key  (inside container)
                     ↑
              Next.js route handler reads this file at request time
              (never stored as env var, never sent to the browser)
```

---

## Indexing Documents

The searchable content comes from documents you provide in the `Dataset/`
folder (excluded from git). After the stack is running, index them into Solr:

```bash
# Bulk-index everything in the Dataset directory
docker compose exec backend python bulk_indexer.py
```

The index is stored under `solr/solr_data/` and persists across restarts.

---

## Local Development (without Docker)

You can run each service directly on your machine.

### 1. Solr

The simplest option is still Docker for Solr only:

```bash
docker compose up solr
```

### 2. Backend (FastAPI)

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# Set the required environment variables, e.g. (PowerShell):
$env:SOLR_URL="http://localhost:8983/solr/nomologia"
$env:DATASET_DIR="../Dataset"
$env:LM_STUDIO_URL="http://localhost:1234/v1"
$env:LM_STUDIO_MODEL="google/gemma-4-12b-qat"

uvicorn clapi:app --reload --port 8000
```

### 3. Frontend (Next.js)

```bash
cd caselaw
cp .env.local.example .env.local   # then fill in your values
npm install
npm run dev
```

Open <http://localhost:3000>.

---

## Deploying to Production

1. Set every value in `.env`, using the **public** URL of your backend for
   `NEXT_PUBLIC_API_URL` (e.g. `https://api.your-domain.com`).
2. Build and start:
   ```bash
   docker compose up --build -d
   ```
3. Put a reverse proxy (nginx / Caddy / Traefik) with HTTPS in front of the
   frontend (`:3000`) and backend (`:8000`).

Because the frontend reads `NEXT_PUBLIC_API_URL` at **build time**, always
rebuild the frontend image after changing that value.

---

## Custom Domain

For a production deployment you need a domain name (e.g. `caselaw.example.com`).

1. Register a domain with any registrar (Namecheap, Cloudflare Registrar, Google Domains, etc.).
2. In your DNS settings create:
   - An **A record** pointing to your server's public IP, **or**
   - A **CNAME record** if you use a managed platform (Vercel, Render, etc.).
3. Update `NEXT_PUBLIC_API_URL` in `.env` to the public backend URL
   (e.g. `https://api.caselaw.example.com`).
4. Place a reverse proxy (**nginx**, **Caddy**, or **Traefik**) with HTTPS in front of
   the frontend (`:3000`) and backend (`:8000`). Caddy handles TLS certificates
   automatically via Let's Encrypt.
5. Because `NEXT_PUBLIC_API_URL` is baked into the client bundle at build time,
   always rebuild after changing it:
   ```bash
   docker compose up --build -d
   ```

---

## SMTP (Email) with Resend

Supabase Auth handles all transactional email (confirm registration, password reset,
etc.) and supports custom SMTP providers. This project uses
[Resend](https://resend.com) — the free plan (3,000 emails/month) is sufficient.

1. Create an account at <https://resend.com> and verify your domain by adding the
   DNS records Resend provides (`TXT` / `MX`).
2. Generate an **API Key** from *API Keys → Create API Key*.
3. In Supabase go to **Project Settings → Authentication → SMTP Settings** and
   enable **Custom SMTP**:

   | Field         | Value |
   | ------------- | ----- |
   | Host          | `smtp.resend.com` |
   | Port          | `465` (SSL) |
   | Username      | `resend` |
   | Password      | your Resend API Key |
   | Sender email  | an address on your verified domain, e.g. `noreply@caselaw.example.com` |

4. Save and send a test email to confirm delivery.

---

## Google OAuth

To enable *Sign in with Google* you need an OAuth 2.0 client in Google Cloud
connected to your Supabase project.

### Step 1 — Create an OAuth client in Google Cloud

1. Go to <https://console.cloud.google.com> and create (or select) a project.
2. Navigate to **APIs & Services → OAuth consent screen**.
   - Set **User Type** to *External* and fill in the app name, support email,
     and developer contact email. Save.
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - **Application type**: *Web application*
   - **Authorised JavaScript origins**: `https://your-project-ref.supabase.co`
   - **Authorised redirect URIs**: `https://your-project-ref.supabase.co/auth/v1/callback`
4. Copy the generated **Client ID** and **Client Secret**.

### Step 2 — Connect to Supabase

1. In Supabase go to **Authentication → Providers → Google**.
2. Toggle **Enable**.
3. Paste the **Client ID** and **Client Secret** from the previous step.
4. Save — Google sign-in is now active.

---

## Database Setup (Supabase Schema)

The full database schema (tables, functions, triggers, Row Level Security
policies and grants) lives in a single file: [`Database/schema.sql`](Database/schema.sql).

On a fresh Supabase project, recreate the whole schema in one step:

1. Open your project in the **Supabase Dashboard**.
2. Go to **SQL Editor → New query**.
3. Copy the entire contents of `Database/schema.sql` and paste it into the editor.
4. Click **Run**.

The script is dependency-safe and idempotent (it uses `create table if not
exists`, `create or replace function`, and `drop trigger if exists`), so it is
safe to run on both a fresh and an existing database.

> **Note:** Only `Database/schema.sql` is tracked in git. The per-object files
> (`profiles.sql`, `organisations.sql`, `invite_tokens.sql`,
> `recent_searches.sql`, `functions.sql`, `auth_triggers.sql`) are git-ignored —
> they are working copies whose content is already consolidated into
> `schema.sql`.

After running the schema, promote your account to admin as described in
[Assigning the Admin Role](#assigning-the-admin-role).

---

## Assigning the Admin Role

Every new user registers with the role `user`. To promote an account to `admin`
run the following SQL in the **Supabase SQL Editor**
(*Dashboard → SQL Editor → New query*):

1. Register in the app with the account you want to make admin.
2. Find the user's **UUID** under *Supabase → Authentication → Users* (the *UID* column).
3. Replace `'Your user uuid'` below and run the whole script:

```sql
-- 1. Add role column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- 2. Make yourself admin (replace with your actual user ID from Auth → Users)
UPDATE public.profiles SET role = 'admin' WHERE id = 'Your user uuid';

-- 3. RLS: admins can read all profiles
CREATE POLICY "Admins can read all profiles" ON public.profiles FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- 4. Function to count total users (bypasses RLS on auth.users safely)
CREATE OR REPLACE FUNCTION get_user_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*) FROM auth.users;
$$;
```

After running the script the account gains access to the Admin Dashboard.

---

## Security Notes

- Secrets (`.env`, `.env.local`, `secrets/`) are git-ignored — never commit them.
- Only `.env.example` (placeholders) is committed — no real values.
- `SUPABASE_SERVICE_ROLE_KEY` is stored as a **Docker secret** (`secrets/supabase_service_role_key.txt`), mounted at `/run/secrets/` inside the container, and read server-side only — it is never set as an environment variable and never reaches the browser.
- The backend currently allows all CORS origins for development; restrict
  `allow_origins` in `backend/clapi.py` before exposing it publicly.

---

## Troubleshooting

| Problem                                  | Fix                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------- |
| Frontend can't reach the API             | Check `NEXT_PUBLIC_API_URL` and rebuild the frontend image.         |
| Login / auth not working                 | Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env`. |
| Admin "delete user" returns 500          | Check that `secrets/supabase_service_role_key.txt` exists and contains a valid key, then rebuild: `docker compose up --build frontend`. |
| AI assistant returns an error            | Ensure LM Studio is running and `LM_STUDIO_URL` / `LM_STUDIO_MODEL` are correct. |
| Search returns nothing                   | Run the indexer (see [Indexing Documents](#indexing-documents)).    |
| Changed `NEXT_PUBLIC_*` but no effect    | Rebuild: `docker compose up --build`.                               |
