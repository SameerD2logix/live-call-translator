# Live Call Translator

Speak Urdu on Zoom or Google Meet; your client hears English in your voice.
This repository is at **Phase 1**: one direction (Urdu → English) with a live transcript and per-stage latency logging.

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

**Provider layer.** `apps/gateway/src/providers/types.ts` defines `SttProvider`, `TranslationProvider` and `TtsProvider`.
`providers/index.ts` is the only file that knows which implementations exist. Switching to self-hosted models means
adding three classes and changing env vars; the pipeline, WebSocket code and browser don't change.

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
│  │     ├─ pipeline/               outgoing-pipeline.ts: STT → translate → ordered TTS
│  │     └─ ws/realtime-route.ts    One WebSocket = one call session; all per-connection checks
│  │  └─ test/pipeline.smoke.ts     Runs the real pipeline on mock providers; validates every event
│  └─ web/                          Next.js app
│     ├─ proxy.ts                   Per-request nonce CSP (middleware.ts on Next 15)
│     ├─ next.config.ts             Static security headers
│     ├─ app/api/realtime/ticket/   Mints the 60 s WebSocket ticket
│     ├─ lib/auth/session.ts        PHASE 1 placeholder → Auth.js in Phase 2
│     ├─ lib/audio/                 mic-capture.ts, pcm-player.ts
│     ├─ lib/realtime/              gateway-client.ts
│     ├─ public/worklets/           pcm-capture-worklet.js (resamples mic to 16 kHz PCM16)
│     ├─ hooks/                     use-translator-session.ts (session state machine)
│     ├─ components/call/           CallScreen, StartStopButton, StatusIndicator, LatencyBadge, TranscriptPanel
│     └─ types/css.d.ts             Lets TypeScript accept global CSS imports
└─ .github/                         CI (lint, typecheck, smoke test, build, audit) and Dependabot
```

## Run it locally

Requires Node 22+ and pnpm 10 (`corepack enable`).

```bash
pnpm install
cp apps/gateway/.env.example apps/gateway/.env
cp apps/web/.env.example apps/web/.env.local
openssl rand -base64 48   # paste into TICKET_SECRET (gateway) AND GATEWAY_TICKET_SECRET (web)
```

**0. Smoke test (10 seconds, no keys).** `pnpm --filter @lct/gateway smoke` runs the real pipeline on mock
providers and checks every event against the shared protocol.

**1. Mock mode first (no keys, no cost).** In `apps/gateway/.env` set `STT_PROVIDER=mock`, `TRANSLATION_PROVIDER=mock`,
`TTS_PROVIDER=mock`. Run `pnpm dev`, open http://localhost:3000, press Start, talk for two seconds, then pause.
You should see a fixed Urdu sentence, its English translation, hear a short tone, and see the delay badge update.

**2. Real providers.** Set the three providers back, add `ELEVENLABS_API_KEY`, `ELEVENLABS_DEFAULT_VOICE_ID`
(any voice from your ElevenLabs library for now) and `ANTHROPIC_API_KEY`. Restart `pnpm dev`.

Wear headphones. Otherwise the translated voice from your speakers goes back into the microphone.

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

## Security in Phase 1

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

### Known gaps, tracked for later phases

- **Sign-in is a placeholder.** `getCurrentUser()` returns a dev user only in development. In production it returns
  nobody, so a deployed build is unusable until Phase 2 adds Auth.js. This is intentional.
- **In-memory limits and ticket replay cache** work for one gateway instance. Move to Redis before scaling out.
- **Provider data retention.** Audio and text go to ElevenLabs and Anthropic. Review each provider's retention
  settings (Scribe has an `enable_logging` option; zero-retention may need a higher plan) and disclose them in your privacy policy.
- **No auto-reconnect** if the speech service drops mid-call; the user presses Start again.
- **Stop discards the sentence in progress.** A later version should commit it and finish speaking before closing.
- **The interface is English-only.** Urdu transcripts already render right-to-left in Nastaliq; the full bilingual
  Urdu/English UI with an RTL layout arrives with the onboarding screens in Phase 2–3.
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
- TTS: `eleven_flash_v2_5` is still the lowest-latency model. `eleven_v4_turbo` (released 28 Sep 2026) is more
  expressive at roughly 100 ms; voice clones made before v4 must be retrained for it. Try both in Phase 2.

Still to test live in Phase 0:

- How list parameters are encoded (the code sends repeated keys: `secondary_languages=en`). If the Scribe handshake
  is rejected with `invalid_request`, set `STT_SECONDARY_LANGUAGES=` (empty) and check again.
- Urdu accuracy with English words mixed in, with and without `language_code=ur`.
- The best `VAD_SILENCE_SECS` for long Urdu sentences (try 0.5–0.8).

## Next: Phase 2

Auth.js with Postgres (email + password, argon2, optional 2FA), the voice-recording onboarding with an explicit consent
checkbox, cloning through the provider, storing only the voice ID, and delete-my-voice / delete-my-account.
