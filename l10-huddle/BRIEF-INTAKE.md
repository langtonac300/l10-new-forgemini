# Pre-huddle brief intake (doPost contract) — v1.20

The app accepts a weekly **pre-huddle brief** by HTTPS POST to the deployed web-app
`/exec` URL (the same URL as the app itself; this is the shared project's ONLY
`doPost` — multiplex inside it if another module ever needs POST). **Producer today:
none** — the scheduled Tuesday-morning `tuesday-pre-brief` routine was retired
2026-07-09. The contract stays live for manual session posts or a future producer.

- **Auth:** the JSON body's `token` field must equal the **`L10_BRIEF_TOKEN` script
  property** (menu: **L10 Huddle → Brief → Set intake token…**; never in a sheet
  cell). No token property set = intake off, all posts rejected.
- **Access requirement:** the web-app deployment must be **Execute as: Me · Who has
  access: Anyone** (plain "Anyone" — not "Anyone with Google account") or the
  unauthenticated POST gets a Google sign-in page. Verify by opening the `/exec` URL
  in an **incognito window**: the app should load with no login. Writes stay
  token-guarded; the URL itself is high-entropy.
- **Which URL:** with several deployments, auto-detection is unreliable (v1.20.2) —
  pin the real `/exec` link via **Brief → Set web app URL…** (`L10_BRIEF_URL` script
  property); that's the URL the routine should POST to as well.
- **Semantics:** `brief[]` rows **replace** that `weekOf`'s rows in `L10_Brief`
  (idempotent re-posts; rows older than 10 weeks are dropped in the same pass);
  `playbook[]` rows **upsert** `L10_Playbook` by ID. All-or-nothing under a script
  lock — a bad payload writes nothing and the response says which row and why.
- **Sections:** `DOCKET` (ranked IDS candidates; the app renders these with a
  one-tap **promote to issues** that pre-fills the evidence + caveat + playbook
  how-to-run into the IDS Identify notes) · `WATCHLIST` / `EXPERIMENTS` /
  `NEGATIVES` (context strips).
- **Verify with one click (no terminal):** **L10 Huddle → Brief → Send test brief
  (sample rows)** — POSTs two clearly-marked TEST rows to the project's own `/exec`
  URL with the stored token and alerts pass/fail (a web-page-instead-of-JSON reply
  means the deployment needs a new version). The rows land in the current week and
  are replaced wholesale by the next real post.
- **Or verify with curl** (note `-L`: Apps Script answers through a redirect):

```bash
curl -sS -L -X POST '<EXEC_URL>' -H 'Content-Type: application/json' -d '{
  "token": "<TOKEN>",
  "weekOf": "2026-07-06",
  "brief": [
    { "section": "DOCKET", "rank": 1,
      "title": "Amazon pacing reads 242% again — mapping fix still open",
      "body": "Utilization vs the $31K target read 242% in the 6/28 snapshot; Sponsored Brands spend still missing from pacing.",
      "dollarsAtStake": 46000, "accounts": "Amazon",
      "caveat": "budget-mapping artifact — read direction, not level",
      "playbookRef": "" },
    { "section": "WATCHLIST", "rank": 1,
      "title": "NB demo submits still tracking below last year",
      "body": "May read −64% YoY; watch the weekly leads line." }
  ]
}'
# expect: {"ok":true,"weekOf":"2026-07-06","briefRows":2,"playbookRows":0}
# wrong token → {"ok":false,"error":"Bad token."}; posts 404/HTML → the web app
# needs a NEW deployment version (doPost didn't exist in the old one).
```
