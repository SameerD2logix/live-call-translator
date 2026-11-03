/**
 * Interface text for the call screen and the setup wizard, in English and Urdu.
 * `ur` must have exactly the same keys and shapes as `en` (TypeScript enforces it).
 * Account, onboarding and settings pages are still English-only (see README).
 */
export type Lang = "en" | "ur";
export type CallApp = "zoom" | "meet" | "teams" | "whatsapp";

const en = {
  appName: "Live Call Translator",
  settings: "Settings",
  dismiss: "Dismiss",
  otherLanguageName: "اردو",
  switchLanguageLabel: "Show the app in Urdu",

  status_idle: "Ready",
  status_connecting: "Connecting…",
  status_listening: "Listening",
  status_translating: "Translating",
  status_speaking: "Speaking",
  status_muted: "Muted",

  delay: "Delay",
  delayTitle: "Time from when you stop speaking to when your client starts hearing the translation",
  seconds: "s",

  start: "Start",
  stop: "Stop",
  connecting: "Connecting…",
  startHint: "Urdu to English",
  stopHint: "Tap to end translation",
  startAria: "Start translating",
  stopAria: "Stop translating",
  mute: "Mute microphone",
  unmute: "Unmute microphone",
  clearTranscript: "Clear transcript",
  headphonesTip: "Wear headphones, so your microphone doesn't pick up your client's voice.",
  consentTip: "Let your client know you're using a live translation tool.",
  setupReminder: "Set up the virtual cable so your client hears your English inside the call.",
  setupReminderLink: "Set it up",

  outputTitle: "Your English goes to",
  outputDefault: "This computer's speakers (testing only)",
  outputCableFound: "Virtual cable found. Choose it so Zoom or Meet hears your English.",
  outputNoCable: "No virtual cable found.",
  outputUnsupported: "This browser can't choose where sound goes. Use Chrome or Edge.",
  outputNeedsPermission: "Allow the microphone so device names can be shown.",
  allowMic: "Allow microphone",
  refreshDevices: "Refresh",
  monitor: "Also play my English in my headphones",
  outputCableSelected: "Your call app hears your English through the cable.",

  progress: ["Create your account", "Record your voice", "Connect to Zoom or Meet"],
  progressDone: "Completed: ",
  progressCurrent: "Current: ",
  progressNext: "Next: ",

  incomingTitle: "Your client's English, in Urdu",
  incomingIntro: "Share the call's sound to read what your client says in Urdu.",
  shareTab: "Share the call tab",
  shareTabHint: "Google Meet, Zoom or Teams in the browser. Tick “Also share tab audio”.",
  shareScreen: "Share system sound",
  shareScreenHint: "Zoom, Teams or WhatsApp desktop apps. Choose “Entire screen” and turn on “Also share system audio”.",
  stopSharing: "Stop translating the client",
  speakUrdu: "Also read my client's words to me in Urdu",
  speakUrduUnavailable: "Urdu voice isn't set up on the server, so you get subtitles only.",
  incomingNeedsCall: "Press Start first, then share the call's sound.",
  incomingLive: "Translating your client",
  subtitleWaiting: "Waiting for your client to speak…",
  subtitleLabel: "Your client",

  transcriptHeading: "Live transcript",
  colOriginal: "What was said",
  colTranslation: "Translation",
  you: "You",
  client: "Client",
  emptyTranscript:
    "Press Start and speak in Urdu. Each sentence appears here next to its English translation. Share the call's sound to see your client's words in Urdu too.",
  translatingPlaceholder: "Translating…",
  failedYou: "Couldn't translate this sentence. Say it again.",
  failedClient: "Couldn't translate this sentence.",
  failedTts: "Your client didn't hear this one. Say it again.",
  heardAfter: (s: string) => `Heard ${s} s after you finished`,

  err_unauthorized: "Your sign-in expired. Refresh the page and sign in again.",
  err_voice_required: "Record your voice before your first call.",
  err_session_limit: "Translation is open in another tab, or this session reached its time limit. Close other tabs, then press Start.",
  err_quota_exceeded: "You've used today's translation minutes. They reset at 5:00 AM Pakistan time.",
  err_rate_limited: "Audio arrived too fast. Press Start again.",
  err_provider_unavailable: "The translation service isn't responding. Wait a moment, then press Start.",
  err_bad_request: "Something went wrong. Press Start to try again.",
  err_internal: "Something went wrong. Press Start to try again.",
  err_connection: "Couldn't reach the translation server. Check your internet, then press Start.",
  err_insecure: "The translation server's address isn't secure (wss://). Check the configuration.",
  err_mic_denied: "Microphone access is blocked. Allow it from the icon in the address bar, then press Start.",
  err_mic_missing: "No microphone found. Connect one, then press Start.",
  err_mic_busy: "Another app is using your microphone. Close it, then press Start.",
  err_share_no_audio: "No sound was shared. Share again and tick “Also share tab audio” (or system audio).",
  err_output_device: "Couldn't send sound to that device. Pick another one, or check the cable is installed.",

  setupTitle: "Connect to Zoom, Meet or Teams",
  setupIntro:
    "A free “virtual audio cable” carries your translated English into your call app, just like a real microphone. You set it up once on each computer.",
  diagramMic: "Your mic (Urdu)",
  diagramTranslator: "Translator",
  diagramCable: "Virtual cable (English)",
  diagramApp: "Zoom / Meet / Teams",
  osLabel: "Steps for",
  step1Title: "Install the cable",
  step1: {
    windows: [
      "Download “VB-CABLE Driver” from vb-audio.com/Cable. Use only the official site.",
      "Unzip it. Right-click VBCABLE_Setup_x64.exe, choose “Run as administrator”, then “Install Driver”.",
      "Restart your computer.",
    ],
    mac: [
      "Download “BlackHole 2ch” from existential.audio/blackhole (free), or run: brew install blackhole-2ch",
      "Open the installer and follow the steps.",
      "Quit and reopen your browser. If BlackHole still doesn't appear, restart your Mac.",
    ],
    other: ["Linux and ChromeOS aren't supported yet. Use Windows or macOS for calls."],
  },
  step2Title: "Check that the cable works",
  step2Intro: "We'll play a short tone into the cable and listen for it on the other end. You won't hear it.",
  runTest: "Run the test",
  testing: "Testing…",
  test_ok: "It works: sound passes through the cable.",
  test_no_cable: "The cable wasn't found. Finish step 1 and restart, then try again.",
  test_silent: "The cable is installed, but no sound came through. Restart your computer and try again.",
  test_unsupported: "This browser can't send sound to the cable. Use Chrome or Edge.",
  test_denied: "Allow the microphone (the test listens to the cable), then try again.",
  step3Title: "Choose the cable as the microphone in your call app",
  step3Intro: (device: string) =>
    `Pick “${device}” as the microphone. Leave your speakers or headphones as they are, so you still hear your client.`,
  apps: {
    zoom: [
      "Open Zoom, then Settings (gear icon) → Audio.",
      "Under Microphone, choose the cable.",
      "Set background noise suppression to Low, so your translated voice isn't cut off.",
    ],
    meet: ["In the meeting, click More options (⋮) → Settings → Audio.", "Under Microphone, choose the cable."],
    teams: [
      "Click Settings and more (…) → Settings → Devices.",
      "Under Microphone, choose the cable.",
      "Set noise suppression to Low.",
    ],
    whatsapp: [
      "During a call, open the call menu (…) and choose the cable as the microphone.",
      "No such menu? Make the cable your computer's default input before the call (Windows: Settings → System → Sound → Input. Mac: System Settings → Sound → Input) and switch it back afterwards. The translator still uses your real microphone.",
    ],
  } satisfies Record<CallApp, string[]>,
  appNames: { zoom: "Zoom", meet: "Google Meet", teams: "Microsoft Teams", whatsapp: "WhatsApp" } satisfies Record<CallApp, string>,
  step3Done: "I've chosen the cable",
  finishTitle: "All set",
  finishText:
    "Join your call, press Start in the translator and speak Urdu. Before an important call, ask a friend to confirm they hear your English.",
  goToCall: "Go to the call screen",
  skip: "Skip for now",
  stepDone: "Done",
};

export type Dict = typeof en;

const ur: Dict = {
  appName: "لائیو کال ٹرانسلیٹر",
  settings: "سیٹنگز",
  dismiss: "بند کریں",
  otherLanguageName: "English",
  switchLanguageLabel: "ایپ انگریزی میں دکھائیں",

  status_idle: "تیار",
  status_connecting: "جڑ رہا ہے…",
  status_listening: "سن رہا ہے",
  status_translating: "ترجمہ ہو رہا ہے",
  status_speaking: "بول رہا ہے",
  status_muted: "مائیک بند",

  delay: "تاخیر",
  delayTitle: "آپ کے بولنا ختم کرنے سے کلائنٹ کے ترجمہ سننے تک کا وقت",
  seconds: "سیکنڈ",

  start: "شروع کریں",
  stop: "روکیں",
  connecting: "جڑ رہا ہے…",
  startHint: "اردو سے انگریزی",
  stopHint: "ترجمہ ختم کرنے کے لیے دبائیں",
  startAria: "ترجمہ شروع کریں",
  stopAria: "ترجمہ روکیں",
  mute: "مائیک بند کریں",
  unmute: "مائیک کھولیں",
  clearTranscript: "ٹرانسکرپٹ صاف کریں",
  headphonesTip: "ہیڈفون لگائیں تاکہ آپ کا مائیک کلائنٹ کی آواز نہ اٹھائے۔",
  consentTip: "کلائنٹ کو بتا دیں کہ آپ لائیو ترجمے کا ٹول استعمال کر رہے ہیں۔",
  setupReminder: "ورچوئل کیبل سیٹ کریں تاکہ کلائنٹ کال میں آپ کی انگریزی سن سکے۔",
  setupReminderLink: "سیٹ اپ کریں",

  outputTitle: "آپ کی انگریزی کہاں جائے",
  outputDefault: "اس کمپیوٹر کے اسپیکر (صرف ٹیسٹ کے لیے)",
  outputCableFound: "ورچوئل کیبل مل گئی۔ اسے چنیں تاکہ زوم یا میٹ آپ کی انگریزی سنے۔",
  outputNoCable: "ورچوئل کیبل نہیں ملی۔",
  outputUnsupported: "یہ براؤزر آواز کا راستہ نہیں چن سکتا۔ کروم یا ایج استعمال کریں۔",
  outputNeedsPermission: "ڈیوائسز کے نام دیکھنے کے لیے مائیک کی اجازت دیں۔",
  allowMic: "مائیک کی اجازت دیں",
  refreshDevices: "دوبارہ دیکھیں",
  monitor: "میری انگریزی میرے ہیڈفون میں بھی چلائیں",
  outputCableSelected: "آپ کی کال ایپ کیبل کے ذریعے آپ کی انگریزی سن رہی ہے۔",

  progress: ["اکاؤنٹ بنائیں", "اپنی آواز ریکارڈ کریں", "زوم یا میٹ سے جوڑیں"],
  progressDone: "مکمل: ",
  progressCurrent: "موجودہ: ",
  progressNext: "اگلا: ",

  incomingTitle: "کلائنٹ کی انگریزی، اردو میں",
  incomingIntro: "کال کی آواز شیئر کریں تاکہ کلائنٹ کی بات اردو میں پڑھ سکیں۔",
  shareTab: "کال والا ٹیب شیئر کریں",
  shareTabHint: "براؤزر میں گوگل میٹ، زوم یا ٹیمز کے لیے۔ “Also share tab audio” پر نشان لگائیں۔",
  shareScreen: "سسٹم کی آواز شیئر کریں",
  shareScreenHint: "زوم، ٹیمز یا واٹس ایپ کی ڈیسک ٹاپ ایپ کے لیے۔ “Entire screen” چنیں اور “Also share system audio” آن کریں۔",
  stopSharing: "کلائنٹ کا ترجمہ روکیں",
  speakUrdu: "کلائنٹ کی باتیں مجھے اردو میں سنائیں بھی",
  speakUrduUnavailable: "سرور پر اردو آواز سیٹ نہیں، اس لیے صرف سب ٹائٹلز ملیں گے۔",
  incomingNeedsCall: "پہلے شروع کریں دبائیں، پھر کال کی آواز شیئر کریں۔",
  incomingLive: "کلائنٹ کا ترجمہ ہو رہا ہے",
  subtitleWaiting: "کلائنٹ کے بولنے کا انتظار…",
  subtitleLabel: "آپ کا کلائنٹ",

  transcriptHeading: "لائیو ٹرانسکرپٹ",
  colOriginal: "جو کہا گیا",
  colTranslation: "ترجمہ",
  you: "آپ",
  client: "کلائنٹ",
  emptyTranscript:
    "شروع کریں دبائیں اور اردو میں بولیں۔ ہر جملہ یہاں اپنے انگریزی ترجمے کے ساتھ نظر آئے گا۔ کلائنٹ کی باتیں اردو میں دیکھنے کے لیے کال کی آواز بھی شیئر کریں۔",
  translatingPlaceholder: "ترجمہ ہو رہا ہے…",
  failedYou: "یہ جملہ ترجمہ نہیں ہو سکا۔ دوبارہ کہیں۔",
  failedClient: "یہ جملہ ترجمہ نہیں ہو سکا۔",
  failedTts: "کلائنٹ نے یہ جملہ نہیں سنا۔ دوبارہ کہیں۔",
  heardAfter: (s: string) => `آپ کے ختم کرنے کے ${s} سیکنڈ بعد سنا گیا`,

  err_unauthorized: "آپ کا سائن اِن ختم ہو گیا۔ صفحہ ری فریش کر کے دوبارہ سائن اِن کریں۔",
  err_voice_required: "پہلی کال سے پہلے اپنی آواز ریکارڈ کریں۔",
  err_session_limit: "ترجمہ کسی اور ٹیب میں کھلا ہے، یا اس سیشن کا وقت ختم ہو گیا۔ دوسرے ٹیب بند کریں، پھر شروع کریں دبائیں۔",
  err_quota_exceeded: "آج کے ترجمے کے منٹ ختم ہو گئے۔ یہ پاکستان کے وقت صبح 5 بجے دوبارہ ملیں گے۔",
  err_rate_limited: "آواز بہت تیزی سے آئی۔ دوبارہ شروع کریں دبائیں۔",
  err_provider_unavailable: "ترجمے کی سروس جواب نہیں دے رہی۔ تھوڑی دیر بعد شروع کریں دبائیں۔",
  err_bad_request: "کچھ گڑبڑ ہو گئی۔ دوبارہ کوشش کے لیے شروع کریں دبائیں۔",
  err_internal: "کچھ گڑبڑ ہو گئی۔ دوبارہ کوشش کے لیے شروع کریں دبائیں۔",
  err_connection: "ترجمے کے سرور تک رسائی نہیں ہو سکی۔ انٹرنیٹ چیک کریں، پھر شروع کریں دبائیں۔",
  err_insecure: "ترجمے کے سرور کا پتہ محفوظ نہیں (wss://)۔ کنفیگریشن چیک کریں۔",
  err_mic_denied: "مائیک کی اجازت بند ہے۔ ایڈریس بار کے آئیکن سے اجازت دیں، پھر شروع کریں دبائیں۔",
  err_mic_missing: "کوئی مائیک نہیں ملا۔ مائیک لگائیں، پھر شروع کریں دبائیں۔",
  err_mic_busy: "کوئی اور ایپ مائیک استعمال کر رہی ہے۔ اسے بند کریں، پھر شروع کریں دبائیں۔",
  err_share_no_audio: "کوئی آواز شیئر نہیں ہوئی۔ دوبارہ شیئر کریں اور “Also share tab audio” (یا system audio) پر نشان لگائیں۔",
  err_output_device: "اس ڈیوائس پر آواز نہیں جا سکی۔ کوئی اور ڈیوائس چنیں، یا کیبل کی انسٹالیشن چیک کریں۔",

  setupTitle: "زوم، میٹ یا ٹیمز سے جوڑیں",
  setupIntro:
    "ایک مفت “ورچوئل آڈیو کیبل” آپ کی ترجمہ شدہ انگریزی کو کال ایپ تک پہنچاتی ہے، بالکل اصلی مائیک کی طرح۔ یہ ہر کمپیوٹر پر ایک بار سیٹ کرنی ہوتی ہے۔",
  diagramMic: "آپ کا مائیک (اردو)",
  diagramTranslator: "ٹرانسلیٹر",
  diagramCable: "ورچوئل کیبل (انگریزی)",
  diagramApp: "زوم / میٹ / ٹیمز",
  osLabel: "ہدایات برائے",
  step1Title: "کیبل انسٹال کریں",
  step1: {
    windows: [
      "“VB-CABLE Driver” صرف آفیشل سائٹ vb-audio.com/Cable سے ڈاؤن لوڈ کریں۔",
      "زِپ فائل کھولیں۔ VBCABLE_Setup_x64.exe پر رائٹ کلک کر کے “Run as administrator” چنیں، پھر “Install Driver” دبائیں۔",
      "کمپیوٹر ری اسٹارٹ کریں۔",
    ],
    mac: [
      "“BlackHole 2ch” مفت میں existential.audio/blackhole سے ڈاؤن لوڈ کریں، یا یہ کمانڈ چلائیں: brew install blackhole-2ch",
      "انسٹالر کھولیں اور ہدایات پر عمل کریں۔",
      "براؤزر بند کر کے دوبارہ کھولیں۔ اگر BlackHole پھر بھی نظر نہ آئے تو میک ری اسٹارٹ کریں۔",
    ],
    other: ["لینکس اور کروم او ایس ابھی سپورٹ نہیں۔ کالز کے لیے ونڈوز یا میک استعمال کریں۔"],
  },
  step2Title: "چیک کریں کہ کیبل کام کر رہی ہے",
  step2Intro: "ہم کیبل میں ایک مختصر آواز چلائیں گے اور دوسری طرف سے سنیں گے۔ آپ کو یہ سنائی نہیں دے گی۔",
  runTest: "ٹیسٹ چلائیں",
  testing: "ٹیسٹ ہو رہا ہے…",
  test_ok: "کام کر رہی ہے: آواز کیبل سے گزر رہی ہے۔",
  test_no_cable: "کیبل نہیں ملی۔ پہلا مرحلہ مکمل کر کے ری اسٹارٹ کریں، پھر دوبارہ کوشش کریں۔",
  test_silent: "کیبل انسٹال ہے لیکن آواز نہیں گزری۔ کمپیوٹر ری اسٹارٹ کر کے دوبارہ کوشش کریں۔",
  test_unsupported: "یہ براؤزر کیبل میں آواز نہیں بھیج سکتا۔ کروم یا ایج استعمال کریں۔",
  test_denied: "مائیک کی اجازت دیں (ٹیسٹ کیبل کو سنتا ہے)، پھر دوبارہ کوشش کریں۔",
  step3Title: "کال ایپ میں کیبل کو مائیک کے طور پر چنیں",
  step3Intro: (device: string) =>
    `مائیک میں “${device}” چنیں۔ اسپیکر یا ہیڈفون ویسے ہی رہنے دیں تاکہ آپ کلائنٹ کو سنتے رہیں۔`,
  apps: {
    zoom: [
      "زوم کھولیں، پھر Settings (گیئر کا آئیکن) ← Audio۔",
      "Microphone میں کیبل چنیں۔",
      "بیک گراؤنڈ نوائز سپریشن کو Low پر رکھیں تاکہ آپ کی ترجمہ شدہ آواز کٹے نہیں۔",
    ],
    meet: ["میٹنگ میں More options (⋮) ← Settings ← Audio کھولیں۔", "Microphone میں کیبل چنیں۔"],
    teams: ["Settings and more (…) ← Settings ← Devices کھولیں۔", "Microphone میں کیبل چنیں۔", "Noise suppression کو Low پر رکھیں۔"],
    whatsapp: [
      "کال کے دوران کال مینیو (…) کھولیں اور مائیک میں کیبل چنیں۔",
      "یہ مینیو نہیں ہے؟ کال سے پہلے کیبل کو کمپیوٹر کا ڈیفالٹ اِن پٹ بنائیں (ونڈوز: Settings ← System ← Sound ← Input۔ میک: System Settings ← Sound ← Input) اور کال کے بعد واپس بدل دیں۔ ٹرانسلیٹر پھر بھی آپ کا اصلی مائیک استعمال کرے گا۔",
    ],
  },
  appNames: { zoom: "زوم", meet: "گوگل میٹ", teams: "مائیکروسافٹ ٹیمز", whatsapp: "واٹس ایپ" },
  step3Done: "میں نے کیبل چن لی",
  finishTitle: "سب تیار ہے",
  finishText:
    "کال جوائن کریں، ٹرانسلیٹر میں شروع کریں دبائیں اور اردو میں بولیں۔ کسی اہم کال سے پہلے کسی دوست سے تصدیق کروا لیں کہ اسے آپ کی انگریزی سنائی دے رہی ہے۔",
  goToCall: "کال اسکرین پر جائیں",
  skip: "ابھی چھوڑ دیں",
  stepDone: "مکمل",
};

export const dictionaries: Record<Lang, Dict> = { en, ur };

export const LANG_COOKIE = "lct_lang";

export function parseLang(value: string | undefined): Lang {
  return value === "ur" ? "ur" : "en";
}

export const dirOf = (lang: Lang) => (lang === "ur" ? "rtl" : "ltr");
