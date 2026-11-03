# Live Call Translator

Speak Urdu on Zoom or Google Meet; your client hears English in your voice.
This repository is at **Phase 5**: feature-complete, security-reviewed, fully bilingual, with kits for usability
testing, deployment and the demo video.

- **Phase 5:** security review against the OWASP Top 10:2025 with ten fixes (see `docs/security-review.md`), the whole
  interface in Urdu and English, per-user API rate limits, security-event logs, secret rotation, a daily cleanup job,
  and `docs/` guides for deployment, usability tests and the demo.
- **Phase 4:** a personal glossary (words kept unchanged), sentence merging for Urdu's verb-final pauses, a noise
  gate and pause-length presets, Repeat and Fix (type a correction) buttons, and a check that voice-cloning samples
  really read the prompted sentences.
- **Phase 3:** your English reaches Zoom/Meet/Teams through a virtual audio cable (guided setup with a loopback
  test); your client's English is translated into Urdu subtitles (and optionally an Urdu voice in your headphones);
  the call and setup screens work in Urdu or English.
- **Phase 2:** real accounts (email + password, optional two-step sign-in) and a voice onboarding that clones your
  own voice with explicit consent.
- **Phase 1:** one-direction translation (Urdu → English) with a live transcript and per-stage latency logging.

## Architecture

```
 Browser (Next.js)                         Gateway (Fastify)                         Providers
 ─────────────────                         ─────────────────                         ─────────
 Mic ─► AudioWorklet ─► 16 kHz PCM ──wss──► auth ticket ─► limits ─► STT stream ───► ElevenLabs Scribe v2 Realtime
                                            (origin check,          │ committed sentence
                                             Zod validation)        ▼
                                                                  translate ─────────► Claude (Haiku)
                                                                    │ in order
                                                                    ▼
 Speakers ◄─ PcmPlayer ◄── PCM 24 kHz ◄─wss─────────────────────── TTS stream ───────► ElevenLabs TTS (Flash v2.5)
 Transcript panel ◄── JSON events (partial, final, translation, latency)
```

**Why a separate gateway?** It is the only place that holds API keys, keeps a long-lived WebSocket per call
(serverless functions on Vercel can't), and enforces quotas. The web app can live on Vercel; the gateway on Render or Railway.

**Why Node/Fastify rather than FastAPI?** One language end to end, and the browser and gateway share the same Zod
protocol package, so a message shape can't drift between them. Self-hosted models (Whisper, NLLB, XTTS) are Python;
they will run as separate GPU inference services that the gateway calls through the provider interfaces.

**Provider layer.** `apps/gateway/src/providers/types.ts` defines `SttProvider`, `TranslationProvider`, `TtsProvider`
and (Phase 2) `VoiceCloneProvider`. `providers/index.ts` is the only file that knows which implementations exist.
Switching to self-hosted models means adding classes and changing env vars; the pipeline, WebSocket code and browser
don't change.

### Phase 3: both directions on one call

```
                          one WebSocket, protocol v2 (every binary frame starts with a channel byte)
 Your mic ──[1]──► gateway "out": Urdu STT → translate → TTS in YOUR voice ──[1]──► PcmPlayer → virtual cable → Zoom mic
 Call tab / system sound ──[2]──► gateway "in": English STT → translate → Urdu ──► subtitles (JSON)
                                                                └─ optional Urdu voice (stock) ──[2]──► your headphones
```

- **One socket, two directions.** Upstream channel 1 is your mic, channel 2 is the call's audio; downstream
  channel 1 is your English (sent to the cable with `AudioContext.setSinkId`), channel 2 is the Urdu voice
  (your default output). Each direction has its own rate limit; both count toward the daily quota.
- **Capturing the client.** `getDisplayMedia`: a browser tab with "Also share tab audio" (Meet, Zoom web, Teams
  web; every desktop OS), or the whole screen with system audio for desktop apps (Windows; macOS needs Chrome 141+
  on macOS 14.2+). `restrictOwnAudio` keeps this page's own sound out of the capture, so nothing is translated twice.
- **Feedback safety.** Your translated English goes to the cable, not your speakers. If the cable is the system's
  default microphone (common for WhatsApp Desktop), the app still picks your real microphone.
- **Urdu voice.** Flash v2.5 has no Urdu, so the Urdu voice uses the Eleven v4 family through ElevenLabs' Text to
  Dialogue streaming endpoint with a **stock** voice. The client's voice is never cloned.

### Phase 4: accuracy

- **Glossary.** Stored per user in Postgres (max 50 terms, strict character set). The web app signs the list into
  the call ticket, like the voice id, so the gateway uses only server-vouched terms. The translator keeps them
  unchanged, and Scribe receives them as keyterms (`STT_USE_KEYTERMS`, ~20% extra transcription cost).
- **Sentence merging** (`pipeline/sentence-assembler.ts`). If a committed piece ends with a word that can't end a
  sentence (کے، کو، سے، تک، اور… in Urdu script or Roman Urdu; "and", "the"… in English), it's held and joined with
  the next piece. The hold extends while the speaker keeps talking and is released after `MERGE_INCOMPLETE_MS` of
  silence. The held text stays on screen as live text.
- **Pause presets.** Short (0.5 s) / Normal (server default) / Long (1.1 s) pause ends a sentence; Long suits people
  who pause before the verb. The gateway reports the pause it actually used so the delay badge stays accurate.
- **Noise gate** (in the capture worklet). 20 ms windows are compared with an adaptive noise floor; room noise
  becomes true silence, so Scribe neither hears words in noise nor waits longer to end a sentence. One window of
  look-ahead and a 400 ms hold protect word starts and endings. Adds ~40 ms; can be turned off.
- **Repeat / Fix.** Repeat re-speaks one of your recent sentences (kept in memory for this call only). Fix speaks a
  typed sentence instead: English is spoken exactly as typed, Urdu is translated first; the old line is marked
  "Corrected below".
- **Recording check.** Each voice sample is transcribed with Scribe v2 (batch) and compared with the sentence it was
  meant to read (normalised edit-distance similarity ≥ 0.6, at least 80% of samples). Expected sentences come from
  the web app's own script, never from the browser.

### Phase 2: accounts and voices

```
 Browser ──► Web app (Next.js + Better Auth) ──► Postgres: users, sessions, 2FA, voice_profile, voice_consent
   │            │  POST /api/voice: session, consent, file checks, limits
   │            └─► Gateway POST /internal/v1/voices (60 s single-use service token) ──► ElevenLabs IVC
   │
   └─ POST /api/realtime/ticket ─► ticket { sub: user, voice: <their own voice id from Postgres> }
                                   └─► Gateway WebSocket speaks ONLY with the voice in the signed ticket
```

- **The web app owns the data**, the gateway stays stateless and remains the only holder of provider keys.
- **Voice ownership is enforced by signature, not trust:** the browser never sends a voice id. The web app looks it up
  by user id and signs it into the call ticket; the gateway accepts no other source.
- **Recordings are never stored.** They live in the tab's memory, pass through both servers in memory once, and are
  dropped after cloning. We keep only the provider's voice id. Users can save copies to their own device before upload.

## Folder structure

```
live-call-translator/
├─ packages/
│  └─ protocol/src/index.ts        Shared WebSocket protocol: Zod schemas, audio constants, close codes
├─ apps/
│  ├─ gateway/                      Fastify server: holds secrets, streams audio to providers
│  │  └─ src/
│  │     ├─ index.ts                Server bootstrap: helmet, CORS, rate limit, HTTPS enforcement
│  │     ├─ config/env.ts           Validated env; refuses to start if misconfigured
│  │     ├─ lib/                    logger (redacting), latency tracker, safe error summaries
│  │     ├─ security/               ticket.ts (single-use JWT), limits.ts (slots, quota, token bucket)
│  │     ├─ services/voices.ts      Server-side voice lookup (Phase 2: per-user clone)
│  │     ├─ providers/              types.ts, index.ts, elevenlabs/, anthropic/, mock/
│  │     └─ ws/realtime-route.ts    One WebSocket = one call session; all per-connection checks
│  │     ├─ http/voice-routes.ts    Phase 2: internal create/delete voice API (service-token protected)
│  │     ├─ pipeline/translation-pipeline.ts  Phase 3: one class for both directions (out: ur→en, in: en→ur)
│  │     ├─ pipeline/sentence-assembler.ts    Phase 4: joins sentences cut before the verb
│  │     ├─ lib/text-similarity.ts            Phase 4: transcript vs. prompted sentence (recording check)
│  │  └─ test/pipeline.smoke.ts     Runs the real pipeline on mock providers; validates every event
│  └─ web/                          Next.js app
│     ├─ proxy.ts                   Per-request nonce CSP (middleware.ts on Next 15)
│     ├─ next.config.ts             Static security headers
│     ├─ app/api/realtime/ticket/   Mints the 60 s WebSocket ticket (now carries the user's voice id)
│     ├─ app/api/auth/[...all]/     Better Auth: sign-up/in, email verification, reset, 2FA, delete account
│     ├─ app/api/voice/             Create (POST) / delete (DELETE) the user's voice clone
│     ├─ app/{sign-in,sign-up,two-factor,forgot-password,reset-password,onboarding,settings}/
│     ├─ lib/auth.ts                Better Auth config: Argon2id, verification, 2FA, breach check, rate limits
│     ├─ lib/voice/                 consent text, reading script, repository (SQL), gateway admin client
│     ├─ lib/audio/sample-recorder.ts  MediaRecorder takes with level/clipping checks
│     ├─ lib/audio/{devices,call-capture,cable-test}.ts  Phase 3: cable detection, call-audio capture, loopback test
│     ├─ lib/i18n/                  Phase 3: English/Urdu dictionary, language cookie
│     ├─ app/api/glossary/ + lib/glossary/  Phase 4: words to keep (per user, max 50)
│     ├─ lib/prefs.ts               Phase 4: pause preset and noise gate, remembered on this device
│     ├─ lib/i18n/account.ts        Phase 5: Urdu/English text for sign-in, recording and settings
│     ├─ lib/rate-limit.ts, lib/security-log.ts  Phase 5: per-user API limits, security events
│     ├─ scripts/cleanup.mjs        Phase 5: daily removal of expired sessions, tokens, rate-limit rows
│     ├─ app/setup/                 Phase 3: virtual-cable setup wizard
│     ├─ components/{call,setup,i18n}/  subtitles, output picker, incoming controls, accuracy panel, wizard, language toggle
│     ├─ db/migrations/             Our SQL (voice_profile, voice_consent, glossary_term); scripts/migrate.mjs runs everything
│     ├─ lib/audio/                 mic-capture.ts, pcm-player.ts
│     ├─ lib/realtime/              gateway-client.ts
│     ├─ public/worklets/           pcm-capture-worklet.js (resamples mic to 16 kHz PCM16)
│     ├─ hooks/                     use-translator-session.ts (session state machine)
│     ├─ components/call/           CallScreen, StartStopButton, StatusIndicator, LatencyBadge, TranscriptPanel
│     ├─ components/{auth,onboarding,settings,ui}/
│     └─ types/css.d.ts             Lets TypeScript accept global CSS imports
├─ docker-compose.yml               Local Postgres (bound to 127.0.0.1)
├─ docs/
│  ├─ call-app-testing.md           Phase 3: manual test matrix for Zoom, Meet, Teams, WhatsApp
│  ├─ security-review.md            Phase 5: OWASP Top 10:2025 review, fixes, launch checklist
│  ├─ deploy.md                     Phase 5: Postgres, gateway, web app, cleanup, rotation, post-deploy checks
│  ├─ usability-test-kit.md         Phase 5: tasks, think-aloud, SUS (English/Urdu), findings template
│  └─ demo-script.md                Phase 5: 3-minute storyboard and recording checklist
└─ .github/                         CI (lint, typecheck, smoke test, build, audit) and Dependabot
```

## Run it locally

Requires Node 22+, pnpm 10 (`corepack enable`) and Docker (for local Postgres).

```bash
pnpm install
docker compose up -d db
cp apps/gateway/.env.example apps/gateway/.env
cp apps/web/.env.example apps/web/.env.local
```

Generate **three different** secrets with `openssl rand -base64 48`:

| Secret | apps/web/.env.local | apps/gateway/.env |
|---|---|---|
| Sessions + 2FA encryption | `BETTER_AUTH_SECRET` | – |
| Call tickets | `GATEWAY_TICKET_SECRET` | `TICKET_SECRET` (same value) |
| Voice API (server-to-server) | `INTERNAL_API_SECRET` | `INTERNAL_API_SECRET` (same value) |

Then create the tables: `pnpm --filter @lct/web db:migrate` (Better Auth's tables via its CLI, then ours).

**0. Smoke test (10 seconds, no keys).** `pnpm --filter @lct/gateway smoke` runs the real pipeline on mock
providers and checks every event against the shared protocol.

**1. Mock mode first (no keys, no cost).** In `apps/gateway/.env` set all five providers to `mock`
(`STT_PROVIDER`, `TRANSLATION_PROVIDER`, `TTS_PROVIDER`, `VOICE_CLONE_PROVIDER`, `INCOMING_TTS_PROVIDER`).
Run `pnpm dev` and open http://localhost:3000:

1. Create an account. Without `RESEND_API_KEY`, the confirmation link is printed in the terminal running `pnpm dev`.
2. Record at least 10 sentences (any speech works in mock mode), tick the consent box, create the voice.
3. On the call screen, press Start, talk for two seconds, then pause: a fixed Urdu sentence, its translation and a tone.
4. In Settings, turn on two-step sign-in, sign out, sign back in with a code, then try deleting your voice.
5. Open /setup and follow the cable wizard (install VB-CABLE or BlackHole first), then on the call screen press
   Start and "Share the call tab" on any tab playing speech: mock subtitles appear.

6. Phase 4: in the Accuracy panel add "WordPress", pick the Long pause, then press Start. While live, press Repeat
   or Fix on one of your lines.

**Testing with a real call:** follow `docs/call-app-testing.md`.

**2. Real providers.** Set the providers back to `elevenlabs` / `anthropic` and add `ELEVENLABS_API_KEY` (with voice
cloning permission) and `ANTHROPIC_API_KEY`. Delete your mock voice in Settings and record a real one.

Wear headphones. Otherwise the translated voice from your speakers goes back into the microphone.

**Production email:** create a Resend account, verify your sending domain, and set `RESEND_API_KEY` and `EMAIL_FROM`.
The web app refuses to start in production without them.

## How one sentence flows, and where the time goes

1. The worklet sends 100 ms frames of 16 kHz PCM. Scribe returns partial text (shown in grey) while you speak.
2. When you pause for `VAD_SILENCE_SECS` (0.7 s default), Scribe commits the sentence. Only committed sentences are
   translated, because Urdu puts the verb at the end and a half sentence often can't be translated correctly.
3. Translation starts immediately; speech output is queued so sentences are always spoken in order.
4. TTS audio streams back and starts playing on the first chunk.

Each sentence logs (gateway) and sends (browser console in dev) these stages in milliseconds:
`vad_silence_ms`, `speech_ms`, `translate_ms`, `tts_queue_ms`, `tts_first_audio_ms`, `tts_total_ms`, `server_ms`, `est_delay_ms`.
The browser measures the real delay (`vad_silence + network + server + playback start`), shows it on the badge,
and reports it back to the gateway log as `client playback delay`.

Tuning: lowering `VAD_SILENCE_SECS` cuts delay but splits sentences more often. Test 0.5–0.8 with real speech.

## Security

| Requirement | Where |
|---|---|
| API keys server-side only | Gateway env only; browser never sees a provider key |
| WebSocket auth | 60 s single-use HS256 ticket, sent as the first message (never in the URL), replay-checked |
| Cross-site WebSocket hijacking | Origin allow-list checked before upgrade |
| CSRF on ticket endpoint | Origin must equal `APP_ORIGIN` |
| Input validation | Every JSON message Zod-validated with strict objects; size caps on all frames |
| Abuse and bill protection | Per-IP connection limit, 1 live session per user, audio capped at 1.5× real time, daily minutes quota, max session length |
| Voice ownership | Voice ID resolved on the server from the user ID, never accepted from the browser |
| Transport | HSTS on both apps; gateway rejects non-HTTPS in production; `wss://` required in production |
| Headers | Nonce-based CSP, `frame-ancestors 'none'`, nosniff, strict referrer, microphone-only Permissions-Policy |
| Privacy | No audio or transcripts stored or logged; transcripts live in tab memory only |
| Logging | pino with a redact list; only ids, counts, durations and error codes are logged |
| Prompt injection | Speech wrapped in delimiter tags with angle brackets stripped; system prompt says it's data |
| Dependencies | Dependabot, `pnpm audit` in CI, pnpm 10 install-script allow-list |
| **Phase 2** | |
| Accounts | Better Auth on our Postgres; email verification required before the first session |
| Passwords | Argon2id (19 MiB, 2 passes), 12–128 characters, checked against Have I Been Pwned (k-anonymity) |
| Two-step sign-in | Optional TOTP with one-time backup codes; turning it on requires a verified code; every change needs the password |
| Brute force | Database-backed rate limits: sign-in 5 per 5 min, 2FA 5 per 5 min, sign-up and reset per hour |
| Sessions | 7 days, refreshed daily; password reset signs out every session; secure cookies in production |
| Account enumeration | Sign-up, sign-in and reset show the same message whether or not an email is registered |
| Open redirects | `?next=` accepts same-site paths only |
| Voice consent | Explicit checkbox with the exact statement; stored with version, SHA-256 of the wording and time, before cloning |
| Voice ownership | One voice per user (unique constraint); id only from our database via the signed ticket |
| Voice uploads | Same-origin + session; Content-Length checked before reading; 10–20 files, ≤512 KB each, ≤4 MB total; real type from magic bytes (WebM/Ogg/MP4); plausible durations; 5 attempts per day |
| Voice data | No recordings stored; pseudonymous name at the provider (hash of user id, no email) |
| Server-to-server | Separate `INTERNAL_API_SECRET`; 60 s single-use tokens scoped to one action; delete tokens bound to one voice id |
| Deletion | "Delete my voice" removes it at the provider, then here; deleting the account deletes the voice first and aborts if that fails, so no clone is orphaned |
| **Phase 3** | |
| Screen/tab sharing | Only after an explicit browser prompt; this tab is excluded from the picker; only the audio is used (a 1 fps video track is required by browsers and ignored); `display-capture=(self)` in Permissions-Policy |
| Client's privacy | The client's speech is processed like yours: never stored or logged; never used to clone a voice; the Urdu voice is a stock voice |
| Audio channels | Every binary frame must carry a valid channel byte; per-direction rate limits; frames for a direction that isn't running are dropped |
| Loopback safety | Real-mic selection skips virtual cables; `restrictOwnAudio` on system-audio capture; your English never plays on speakers unless you turn on the monitor |
| Device data | Only the chosen output's per-site device id and label, in localStorage on that computer |
| **Phase 4** | |
| Glossary input | Zod schema with a strict character set (also keeps terms harmless inside the translator's instructions), ≤ 40 characters, ≤ 50 terms; unique per user (case-insensitive index); the limit is enforced in the same SQL statement as the insert |
| Glossary ownership | Every query is scoped by `user_id`; delete only matches the owner's row; the gateway gets the list only inside the signed ticket and re-validates it |
| Typed corrections | ≤ 500 characters, treated as speech data by the translator (never instructions); Fix/Repeat rate-limited per connection (burst 5, then one per 6 s) and only while you're live |
| Voice samples | Must read the prompted sentences (blocks cloning a podcast or video); transcripts are compared in memory and never logged (only counts and a median score) |
| **Phase 5** | Full review in `docs/security-review.md`. Highlights: |
| Client IP | Gateway trusts exactly `TRUSTED_PROXY_HOPS` proxies, so `X-Forwarded-For` can't be spoofed to dodge rate limits |
| API limits | Postgres fixed-window limits per user on our own routes (ticket, glossary, voice delete); fail closed |
| Errors | Generic error replies from the gateway; unhandled rejections logged and the process restarted |
| Secrets | Rotation without downtime via `TICKET_SECRET_PREVIOUS` / `INTERNAL_API_SECRET_PREVIOUS` |
| Logging | Security events as JSON lines (origin rejected, rate limited, voice check failed, bad service token) for alerts |
| Sessions | "Sign out on all other devices"; daily cleanup of expired sessions and tokens |

### Known gaps, tracked for later phases

- **The recording check proves the sentences were read, not who read them.** Someone could still get another person
  to read our script. Next steps: server-issued random prompts per attempt, and a speaker-similarity check between
  recordings and later call audio.
- **Sentence merging uses word lists.** It catches the common "paused before the verb" case but not every
  incomplete clause; an LLM-based end-of-sentence check could follow if real calls show the need.
- **Noise suppression** is the browser's built-in suppressor plus our gate. An RNNoise-class model (WASM) would help
  in very noisy rooms; it needs `'wasm-unsafe-eval'` in the CSP.
- **Sign-up reveals existing emails to direct API callers.** The UI hides it, but Better Auth's endpoint answers
  differently for registered emails; rate limits slow probing. Revisit when Better Auth offers an enumeration-safe mode.
- **Consent records are deleted with the account** (right to erasure). If you need longer proof of consent for legal
  reasons, keep a pseudonymous copy and say so in your privacy policy.
- **The voice id inside the call ticket is readable** by the user's own browser (signed, not encrypted). It is useless
  without our ElevenLabs key; encrypt the ticket (JWE) if you'd rather not expose it.
- **In-memory limits and token replay caches** (call tickets and service tokens) work for one gateway instance. Move to
  Redis before scaling out.
- **Provider data retention.** Audio and text go to ElevenLabs and Anthropic. Review each provider's retention
  settings (Scribe has an `enable_logging` option; zero-retention may need a higher plan) and disclose them in your privacy policy.
- **No auto-reconnect** if the speech service drops mid-call; the user presses Start again.
- **Stop discards the sentence in progress.** A later version should commit it and finish speaking before closing.
- **Push-to-talk isn't built.** A web page only receives keys while focused, and during a call Zoom has focus;
  real push-to-talk needs a global hotkey (browser extension or desktop helper).
- **Real calls and real users haven't been tested yet.** Run `docs/call-app-testing.md` and
  `docs/usability-test-kit.md`; check the wizard's per-app menu names (especially WhatsApp Desktop) against current
  app versions and add screenshots.
- **Open launch actions** (see the end of `docs/security-review.md`): pin GitHub Actions to SHAs, pin the Better Auth
  CLI version, enable secret scanning, set up log alerts, and get an external penetration test or ZAP scan.
- CSP allows inline styles (`style-src 'unsafe-inline'`), required by React style attributes; scripts remain nonce-only.
- Pin GitHub Actions to commit SHAs.

### Verify the security controls yourself

```bash
# Wrong origin must be refused before the WebSocket opens (expect 403)
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Origin: https://evil.example" \
  http://localhost:8787/v1/realtime

# Ticket endpoint must refuse cross-origin requests (expect 403)
curl -i -X POST -H "Origin: https://evil.example" http://localhost:3000/api/realtime/ticket

# Internal voice API without a service token (expect 401)
curl -i -X DELETE http://localhost:8787/internal/v1/voices/abcdefghij

# Voice upload from another site (expect 403), and signed out (expect 401)
curl -i -X POST -H "Origin: https://evil.example" http://localhost:3000/api/voice
curl -i -X POST -H "Origin: http://localhost:3000" http://localhost:3000/api/voice
```

In DevTools → Network, confirm no provider keys appear anywhere and the WebSocket URL contains no token.

## ElevenLabs details (checked against the docs, November 2026)

Verified in the Scribe v2 Realtime API reference and event reference:

- Query parameters used here all exist: `model_id`, `audio_format`, `language_code`, `secondary_languages`,
  `commit_strategy=vad`, `vad_silence_threshold_secs`, `keyterms` (max 50, adds a 20% premium to transcription cost).
- Every error event name mapped in `scribeErrorCode()` matches the event reference.
- Scribe closes a session after 15 s with no client messages. The worklet keeps sending silence while you're muted,
  so a muted mic doesn't drop the call (that silence is still billed audio).
- `enable_logging=false` (zero retention) is enterprise-only, so assume ElevenLabs keeps logs on other plans.
- TTS: `eleven_flash_v2_5` is still the lowest-latency model (32 languages, no Urdu). `eleven_v4_turbo` (released
  28 Sep 2026) is more expressive at roughly 100 ms and speaks Urdu, but the v4 family is served through **Text to
  Dialogue**, not the plain TTS endpoint: use `TTS_PROVIDER=elevenlabs-dialogue` to try it for your English, and
  it's the default for the incoming Urdu voice. Clones made before v4 must be retrained for it.

Verified for Phase 4: batch transcription is `POST /v1/speech-to-text` with `model_id=scribe_v2`, `file` and an
optional `language_code`; WebM and Ogg are accepted.

Still to test live in Phase 0:

- How list parameters are encoded (the code sends repeated keys: `secondary_languages=en`). If the Scribe handshake
  is rejected with `invalid_request`, set `STT_SECONDARY_LANGUAGES=` (empty) and check again.
- Urdu accuracy with English words mixed in, with and without `language_code=ur`.
- The best `VAD_SILENCE_SECS` for long Urdu sentences (try 0.5–0.8).

## After Phase 5

The build plan is complete. What remains needs people and real accounts:

1. Deploy to staging (`docs/deploy.md`) and do the launch actions in `docs/security-review.md`.
2. Run real calls (`docs/call-app-testing.md`) and tune `VAD_SILENCE_SECS`, `MERGE_INCOMPLETE_MS`, the noise gate and
   the recording-check threshold from what you observe.
3. Usability sessions with 3–5 freelancers (`docs/usability-test-kit.md`); fix severity 3–4 findings.
4. Record the demo (`docs/demo-script.md`).

Later: Redis for multi-instance gateways, a global push-to-talk hotkey (extension or desktop helper), RNNoise-class
noise suppression, server-issued random recording prompts, and self-hosted Whisper/NLLB/XTTS behind the provider layer.
