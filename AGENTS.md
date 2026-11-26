# AGENTS.md

This file provides guidance to all AI Agents when working with code in this repository.

## Project

CaseFlow looks up Indian court records by CNR, streams a case summary, and answers follow-up questions from the saved record. The web app and standalone CLI share the scraper and model code.

- `frontend/` — Next.js 16 App Router, React 19, TypeScript and Tailwind 4. Owns the workspace, chat history and API proxy.
- `backend/` — Python 3.13+, FastAPI, Playwright Chromium and the OpenAI Responses API. Retrieves court records and stores model context.

## Commands

Run from the repo root in PowerShell. Use separate terminals for the two servers. The frontend tracks `package-lock.json`; the README and Docker build use `npm ci`. Bun is the user’s local preference.

```powershell
uv sync --directory backend --locked                         # Install backend/uv.lock
uv run --directory backend playwright install chromium       # Install the browser binary
$env:HEADLESS = '1'                                          # Run Chromium without a display
uv run --directory backend uvicorn api:app --host 127.0.0.1 --port 8000 --reload  # API
uv run --directory backend python main.py                    # Standalone CLI, sample KABC0A0015162024
uv run --directory backend python -m unittest discover -s tests  # Existing fixture tests, when requested

cd frontend                                                  # Run the remaining commands here
bun install --no-save                                        # Install locally, keep existing lockfile
bun run dev                                                  # Next.js dev server on :3000 (webpack)
bun run lint                                                 # ESLint with Next.js and TypeScript rules
bun run build                                                # Production build and type check
bun run start                                                # Serve the completed build
```

## Runtime Dependencies

- Live lookups require Chromium and the eCourts service at `services.ecourts.gov.in/ecourtindia_v6/`. The web flow needs a user to enter the CAPTCHA. The optional FIR lookup uses `ksp.karnataka.gov.in/firsearch/en` and `backend/data/all_ps.json`. A missing PDF or failed upload still allows a summary.
- Set `OPENAI_API_KEY` in the root `.env` with access to `gpt-6-luna`. FastAPI starts without a key, but summary and follow-up generation fail. If only title generation fails, `titles.generate_case_title` tries the case type from the summary.
- Next.js needs Node 20.9+ and reaches FastAPI through server-side `BACKEND_URL` (default `http://localhost:8000`). Both processes need writable local storage for their respective chat files.

## Architecture

1. `HomePage.handleSubmit` in `frontend/src/app/page.tsx` posts to `/api/chats`. Next.js creates a UUID and opens `/chat/<id>`. `ChatView` starts a lookup when the saved chat has no assistant message.
2. `POST /api/chats/<id>/stream` calls FastAPI’s `GET /case-summary`. `api.create_app` owns a process-local `Operations` registry. It starts a worker thread per lookup and cancels active operations on shutdown.
3. `scraper.scrape_case_data_interactive` streams progress and manual-input requests. The browser replies through `POST /api/chats/<id>/input` → `POST /manual-input/<id>`. The optional FIR station picker reads `/api/chats/all-ps` → `/all-ps`.
4. `Cases._generate_summary` sends the overview image, hearing rows and optional FIR to the model. It saves the completed result to `backend/data/<id>/conv_history.json`, then emits `complete`. Next.js saves the displayed messages and title to `frontend/chat-data/<id>.json`.
5. `POST /api/chats/<id>/chat` forwards to `POST /chat`. `Cases._generate_followup` reloads backend context and re-uploads the FIR from its saved URL when available. Each side persists the completed turn.

**Non-obvious details**

- `backend/src/config.py` loads the root `.env` at import with `override=True`, so its values win over shell settings. Restart the backend after changing settings, cached prompts (`load_prompt`), or the cached station catalog (`ConversationStore.stations`, `district._station_districts`).
- Keep a single API worker: `Operations.reserve` allows one operation per chat and four per process by default. Manual input must reach the same process. `operations.py` sets a 120-second input timeout and 15-second SSE heartbeat. `config.MAX_CAPTCHA_RETRIES` is 3.
- `frontend/src/lib/backend-stream.ts::relayCaseStream` requires nonempty text and a `complete` event for `X-CaseFlow-Stream: 2`. An `Error:` progress event or interrupted v2 stream prevents the frontend save. The summary route re-reads the chat before saving to preserve a manual rename.
- `frontend/src/lib/storage.ts` resolves `chat-data/` from the server’s working directory. Deleting a chat there leaves the backend context on disk. `ConversationStore.read` also supports older records with a separate `case_overview.png`.

## Misc

- `start.py` uses the invoking Python interpreter, starts the **built** frontend with npm and opens an ngrok tunnel to port 3000. The documented two-terminal setup runs locally without ngrok. Docker uses its own launcher and takes the frontend port from `PORT`.
- The README describes a 16-character CNR. FastAPI accepts 1–128 characters and rejects blanks. `.env.example` lists `OPENAI_API_KEY` and `LOG_LEVEL` but omits `HEADLESS`. The frontend README points to `app/page.tsx` and Geist, while the app uses `src/app/page.tsx` and Google Fonts via `globals.css`.
- Ask the user before spawning or running sub-agents. The root `.gitignore` currently omits an explicit `agent_temp/` rule.

## General Working Rules (User Preferences)

- **Ignore `./temp/` completely.** Never read from it. It is the User's scratchpad.
- **Never `git commit` or `git push`.** The User reviews and commits by hand. `git pull` is fine.
- **Keep it simple.** Treat this as a hobby project unless told it is production. Don't overengineer.
- **No tests** unless the user asks. You may ask before a coding session starts.
- **Minimal comments.** Use descriptive names so the code explains itself.
- **Docs:** don't write a new `.md` per change. Ask first. If yes, update an existing `.md` or this file.
- **Python:** use `uv`, not pip, unless the project already uses pip. Keep `pyproject.toml` complete and current.
- **JS/TS:** use Bun for packages and scripts. Prefer TS over JS unless told otherwise.
- **New frontends:** latest Next.js unless told otherwise. **New backend APIs:** FastAPI.
- **Repo layout:** prefer a monorepo unless told otherwise.
- **CLI scaffolding (`bunx`/`npx`, etc.):** pass every option as flags so nothing prompts interactively. Ask the user about choices first if needed.
- **Docker:** use multi-stage builds and small base images. Multiple containers → Dockerfiles plus a `docker-compose.yml`.
- Keep `.gitignore` and `.env.example` in sync with changes.
- Use `./agent_temp` (gitignored) as a personal scratchpad for yourself or temp scripts/ data etc.
