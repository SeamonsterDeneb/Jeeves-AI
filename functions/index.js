const functions = require('firebase-functions');
const admin = require('firebase-admin');
const textToSpeech = require('@google-cloud/text-to-speech');

admin.initializeApp();
const client = new textToSpeech.TextToSpeechClient();

function formatTextForTTS(input) {
  if (!input) return '';
  return input
    // 1. Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    // 2. Remove images ![alt](url) -> alt text
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1')
    // 3. Convert <a> tags with class "btn" or "action-link-btn" to "button"
    .replace(/<a\b[^>]*class=["'][^"']*\b(?:btn|action-link-btn)\b[^"']*["'][^>]*>(.*?)<\/a>/gi, '$1, button. ')
    // 4. Convert standard HTML links
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1, link. ')
    // 5. Convert HTML buttons
    .replace(/<button\b[^>]*>(.*?)<\/button>/gi, '$1, button. ')
    // 6. Convert Markdown links
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1, link. ')
    // 7. Remove standalone URLs
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
    // 8. Strip heading hashes (# Heading) and pad with periods for pauses before and after
    .replace(/^#{1,6}\s+(.*)$/gm, '. $1. ')
    // 9. Remove bullet point markers (* item, - item)
    .replace(/^\s*[\*\-]\s+/gm, '')
    // 10. Strip bold/italics (*text*, **text**, _text_)
    .replace(/[\*_]{1,2}(.*?)([\*_]{1,2})/g, '$1')
    // 11. Strip inline backticks (`code`)
    .replace(/`([^`]+)`/g, '$1')
    // 12. Strip horizontal rules (---, ***)
    .replace(/^[*\-_]{3,}$/gm, '. ')
    // 13. Clean up multiple spaces and duplicate periods
    .replace(/\s+/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();
}

exports.synthesizeSpeech = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  
  const { text, userId } = req.body;
  if (!userId) return res.status(403).send('Unauthorized');

  const userRef = admin.firestore().collection('users').doc(userId).collection('usage').doc('tts');
  const doc = await userRef.get();
  const data = doc.data() || { count: 0, month: new Date().getMonth() };

  if (data.count >= 1000000) return res.status(429).send('Quota exceeded');

  const request = {
    input: { text: formatTextForTTS(text) },
    voice: { languageCode: 'en-GB', name: 'en-GB-Standard-B' },
    audioConfig: { audioEncoding: 'MP3', pitch: -4, speakingRate: 0.92},
  };

  const [response] = await client.synthesizeSpeech(request);
  
  // Update quota
  await userRef.set({ 
    count: data.count + text.length, 
    month: new Date().getMonth() 
  }, { merge: true });

  res.set('Content-Type', 'audio/mpeg');
  res.send(response.audioContent);
});
