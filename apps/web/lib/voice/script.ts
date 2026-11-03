/**
 * Sentences read aloud to create the voice clone: everyday freelancing phrases, so the
 * recording sounds like a real call. Each has an English and an Urdu version; the user
 * reads one language and sees the other as a guide.
 *
 * English is recommended because the clone will speak English. Urdu works too: the clone
 * learns the voice itself (pitch, tone, accent), not the words.
 * 18 sentences at roughly 4–6 s each lands inside ElevenLabs' recommended 1–2 minutes.
 */
export interface ScriptLine {
  en: string;
  ur: string;
}

export const VOICE_SCRIPT: readonly ScriptLine[] = [
  { en: "Hello, thank you for joining the call today.", ur: "ہیلو، آج کال میں شامل ہونے کا شکریہ۔" },
  { en: "I have reviewed the project details you sent me.", ur: "میں نے آپ کی بھیجی ہوئی پروجیکٹ کی تفصیلات دیکھ لی ہیں۔" },
  { en: "The first version will be ready by Friday evening.", ur: "پہلا ورژن جمعہ کی شام تک تیار ہو جائے گا۔" },
  { en: "Could you share the login details for the staging site?", ur: "کیا آپ اسٹیجنگ سائٹ کی لاگ اِن تفصیلات بھیج سکتے ہیں؟" },
  { en: "I fixed the bug on the checkout page this morning.", ur: "میں نے آج صبح چیک آؤٹ پیج کا مسئلہ ٹھیک کر دیا۔" },
  { en: "My hourly rate is twenty-five dollars.", ur: "میرا فی گھنٹہ ریٹ پچیس ڈالر ہے۔" },
  { en: "Let me explain how the new design works.", ur: "آئیے، میں آپ کو سمجھاؤں کہ نیا ڈیزائن کیسے کام کرتا ہے۔" },
  { en: "That sounds great, I am happy to start next week.", ur: "یہ بہت اچھا ہے، مجھے اگلے ہفتے کام شروع کرنے میں خوشی ہوگی۔" },
  { en: "Please send me your feedback after you test it.", ur: "ٹیسٹ کرنے کے بعد براہِ مہربانی مجھے اپنی رائے بھیج دیں۔" },
  { en: "After the database update, the changes will go live.", ur: "ڈیٹا بیس اپڈیٹ کے بعد تبدیلیاں لائیو ہو جائیں گی۔" },
  { en: "Is there anything else you would like me to change?", ur: "کیا آپ چاہتے ہیں کہ میں کچھ اور تبدیل کروں؟" },
  { en: "The meeting is at three o'clock, Pakistan time.", ur: "میٹنگ پاکستان کے وقت کے مطابق تین بجے ہے۔" },
  { en: "Sorry, the internet was slow for a moment.", ur: "معذرت، ایک لمحے کے لیے انٹرنیٹ سست ہو گیا تھا۔" },
  { en: "We can split the work into three small milestones.", ur: "ہم کام کو تین چھوٹے مرحلوں میں تقسیم کر سکتے ہیں۔" },
  { en: "I usually reply to messages within two hours.", ur: "عام طور پر میری طرف سے دو گھنٹے کے اندر جواب آ جاتا ہے۔" },
  { en: "Can we have a quick video call on Monday morning?", ur: "کیا ہم پیر کی صبح ایک مختصر ویڈیو کال کر سکتے ہیں؟" },
  { en: "The invoice includes design, development and testing.", ur: "انوائس میں ڈیزائن، ڈیولپمنٹ اور ٹیسٹنگ شامل ہیں۔" },
  { en: "Thank you, your trust in my work means a lot to me.", ur: "شکریہ، میرے کام پر آپ کا بھروسہ میرے لیے بہت اہم ہے۔" },
];
