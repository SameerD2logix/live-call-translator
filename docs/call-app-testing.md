# Call app test checklist (Phase 3)

Run this on a real call with a second person (or a second device) playing the client.
Fill in the result for each app and record the browser, OS and app versions you tested.

## Setup for every run

- [ ] The setup wizard's loopback test passes ("It works: sound passes through the cable").
- [ ] Call screen → "Your English goes to" shows the cable selected.
- [ ] You wear headphones; the call app's **speaker** is your headphones, its **microphone** is the cable.
- [ ] You told the other person a translation tool is being used.

## Matrix

| App | How the translator hears the client | Windows | macOS |
|---|---|---|---|
| Google Meet (Chrome tab) | Share the call tab + "Also share tab audio" | | |
| Zoom web client (Chrome tab) | Share the call tab | | |
| Zoom desktop app | Share system sound (Entire screen + "Also share system audio") | | macOS 14.2+ and Chrome 141+ |
| Microsoft Teams (browser) | Share the call tab | | |
| Microsoft Teams (desktop) | Share system sound | | macOS 14.2+ and Chrome 141+ |
| WhatsApp Desktop | Share system sound | | macOS 14.2+ and Chrome 141+ |

Write ✅, ⚠️ (works with a caveat, note it) or ❌ (note what failed) in each cell.

## Test cases

**You → client (outgoing)**

1. Say a short Urdu sentence and pause. The client hears English in **your** voice within about 1–3 seconds.
2. The client never hears your Urdu (only the cable is their microphone).
3. Say three sentences back to back: they arrive in order, none cut off. If the ends are clipped, lower the app's
   noise suppression (Zoom: Low; Teams: Low).
4. Press M (mute): nothing reaches the client; unmute and it resumes.
5. Turn on "Also play my English in my headphones": you hear it too; the client hears no echo.

**Client → you (incoming)**

6. Share the call's sound. The client says an English sentence: the Urdu subtitle appears within about 1–2 seconds
   after they pause; the English shows underneath while they speak.
7. Turn on "Also read my client's words to me in Urdu": you hear Urdu in your headphones, and the client does NOT hear it.
8. With system-sound sharing: your own Urdu voice and the monitor are NOT translated back (restrictOwnAudio).
   If they are, your Chrome is older than 141; use tab sharing or update Chrome.
9. Click the browser's "Stop sharing" bar: subtitles stop, outgoing keeps working.

**Robustness**

10. Unplug/replug headphones during a call: outgoing still reaches the call (the cable doesn't change).
11. Close the laptop lid for a minute, reopen: the app shows a clear error; Start reconnects.
12. Open the call screen in a second tab and press Start: it's refused ("open in another tab").
13. Leave a call running 30+ minutes with both directions: latency stays stable; check the gateway's
    `segment latency` log lines (dir=out and dir=in).

## Record for each failure

App and version, OS and version, browser and version, capture mode (tab or system), what you did, what you expected,
what happened, and the gateway log lines around that time (they contain timings and error codes only, never speech).
