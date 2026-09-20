const functions = require('firebase-functions');
const admin = require('firebase-admin');
const textToSpeech = require('@google-cloud/text-to-speech');

admin.initializeApp();
const client = new textToSpeech.TextToSpeechClient();

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
    input: { text: text },
    voice: { languageCode: 'en-GB', name: 'en-GB-Standard-E' },
    audioConfig: { audioEncoding: 'MP3'},
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
