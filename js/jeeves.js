(function(){
  'use strict';
  // ---------- Firebase Configuration & Initialization ----------
  const firebaseConfig = {
    apiKey: "AIzaSyDKwI4lR1kiaXnjk-hV2ZAUUWy5yvpYzvY",
    authDomain: "jeeves-login-6391e.firebaseapp.com",
    projectId: "jeeves-login-6391e",
    storageBucket: "jeeves-login-6391e.firebasestorage.app",
    messagingSenderId: "273426110474",
    appId: "1:273426110474:web:71f7e27fdd282fc14027f3"
  };

  if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    window.auth = firebase.auth();
    window.db = firebase.firestore();
    window.db.settings({
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: false,
      merge: true
    });
  }

  // Configure highlight.js immediately

  hljs.configure({ ignoreUnescapedHTML: true });

  // ---------- Config / storage ----------

  const LS_KEY_API = 'jeeves_api_key';
  const LS_KEY_PERSONA = 'jeeves_persona';
  const LS_KEY_HONORIFIC = 'jeeves_honorific';
  const LS_KEY_THEME = 'jeeves_theme';
  const LS_KEY_MODEL = 'jeeves_model';
  const LS_KEY_MODEL_OVERRIDES = 'jeeves_model_overrides'; // { [convoType]: modelName }


  const LS_KEY_VOICE_PROFILES = 'jeeves_voice_profiles';
  const LS_KEY_READER_PROGRESS = 'jeeves_reader_progress';
  const LS_KEY_HISTORY = 'jeeves_history';
  const LS_KEY_BLACKLIST = 'jeeves_unavailable_models';
  const LS_KEY_PRICING = 'jeeves_pricing'; // { [modelName]: { inputPerM, outputPerM, free } }
  const LS_KEY_USAGE = 'jeeves_usage_log';
  const LS_KEY_TTS_QUOTA = 'jeeves_tts_quota';
  const LS_KEY_CUSTOM_STORIES = 'jeeves_custom_stories';
  const LS_KEY_STORY_OVERRIDES = 'jeeves_story_overrides'; // { [builtInStoryId]: editedRawLitText }
  const LS_KEY_STORY_CHARACTERS = 'jeeves_story_characters'; // { [storyId]: ['Bertie','Jeeves',...] }
  const LS_KEY_LIBRARY_ORDER = 'jeeves_library_order'; // personal, device-only card order
  const LS_KEY_CONVERSATIONS = 'jeeves_archives';

  const LS_KEY_ACTIVE = 'jeeves_active_id';
  const MAX_TURNS_SENT = 24; // messages (not pairs) sent as context to the API

  function updateUsageDashboard() {
    const now = Date.now();
    const oneMinAgo = now - 60000;
    const recentTokens = state.usageLog.filter(e => e.timestamp > oneMinAgo).reduce((sum, e) => sum + e.input + e.output, 0);
    const dailyRequests = state.usageLog.filter(e => (now - e.timestamp) < 86400000).length;
    const tokenPercent = (recentTokens / 1000000) * 100;
    const reqPercent = (dailyRequests / 1500) * 100;
    const dash = document.getElementById('usage-dashboard');
    if (!dash) return;
    dash.textContent = `Usage: ${Math.round(tokenPercent)}% of token limit | ${Math.round(reqPercent)}% of daily limit`;
    dash.style.background = (tokenPercent > 80 || reqPercent > 80) ? 'rgba(138,59,70,0.4)' : 'transparent';
  }

    let state = {
    apiKey: localStorage.getItem(LS_KEY_API) || '',
    persona: localStorage.getItem(LS_KEY_PERSONA) || 'reggie',
    honorific: localStorage.getItem(LS_KEY_HONORIFIC) || 'Sir',
    theme: localStorage.getItem(LS_KEY_THEME) || 'light',
    model: localStorage.getItem(LS_KEY_MODEL) || '',
    modelOverrides: JSON.parse(localStorage.getItem(LS_KEY_MODEL_OVERRIDES) || '{}'),
    convoType: 'general',


    voiceProfiles: JSON.parse(localStorage.getItem(LS_KEY_VOICE_PROFILES) || '{"Jeeves":{"pitch":0,"rate":1.0,"browserPitch":1.0},"Bertie":{"pitch":2.0,"rate":1.0,"browserPitch":1.1},"Aunt Agatha":{"pitch":5.0,"rate":0.95,"browserPitch":1.35},"Bingo":{"pitch":1.5,"rate":1.05,"browserPitch":1.15},"Aline":{"pitch":4.0,"rate":1.0,"browserPitch":1.25},"Sidney":{"pitch":-2.0,"rate":0.95,"browserPitch":0.85}}'),
    readerProgress: JSON.parse(localStorage.getItem(LS_KEY_READER_PROGRESS) || '{}'),
    history: [],
    conversations: [],
    activeId: localStorage.getItem(LS_KEY_ACTIVE) || 'default',
    fetchedModels: [],
    blacklist: [],
    pricing: {},
    usageLog: JSON.parse(localStorage.getItem(LS_KEY_USAGE)) || [],
    ttsQuota: JSON.parse(localStorage.getItem(LS_KEY_TTS_QUOTA)) || { count: 0, month: '' },
    ttsRate: parseFloat(localStorage.getItem('jeeves_tts_rate')) || 1.0,
    customStories: JSON.parse(localStorage.getItem(LS_KEY_CUSTOM_STORIES) || '[]'),
    storyOverrides: JSON.parse(localStorage.getItem(LS_KEY_STORY_OVERRIDES) || '{}'),
    storyCharacters: JSON.parse(localStorage.getItem(LS_KEY_STORY_CHARACTERS) || '{}'),
    libraryOrder: JSON.parse(localStorage.getItem(LS_KEY_LIBRARY_ORDER) || '[]'),
    activeArchiveTab: 'archives',
    storyCatalogue: [],
    storyTextCache: new Map(),
  };

    // Falls back to the default model whenever a mode has no override set.
  function getModelForConvoType(type){
    return (state.modelOverrides && state.modelOverrides[type]) || state.model;
  }
  let isAuthenticated = false;
  let cloudSyncTimer = null;
  let currentUser = null;

  function signInWithGoogle() {
    if (!window.auth) return;
    const provider = new firebase.auth.GoogleAuthProvider();
    window.auth.signInWithPopup(provider).catch(err => {
      console.error(`Authentication difficulty, ${state.honorific}:`, err);
      if (err.code === 'auth/unauthorized-domain') {
        alert(`Authentication failed: This domain is not authorized in the Firebase Console. Please add "${window.location.hostname}" under Firebase -> Authentication -> Settings -> Authorized Domains.`);
      } else if (err.code !== 'auth/popup-closed-by-user') {
        alert(`Authentication error (${err.code}): ${err.message}`);
      }
    });
  }


  function signOutUser() {
    if (!window.auth) return;
    window.auth.signOut();
  }

  if (typeof firebase !== 'undefined') {
    window.auth.onAuthStateChanged(async (user) => {
      currentUser = user;
      isAuthenticated = !!user;
      const authBtn = document.getElementById('auth-btn');
      const authStatus = document.getElementById('auth-user-status');
      if (authBtn) {
        authBtn.textContent = user ? 'Sign Out' : 'Sign In with Google';
      }
      if (authStatus) {
        authStatus.textContent = user ? `Logged in as ${user.email}` : '';
      }

      listenForSuggestions();

      if (user) {

          await Promise.all([
            pullUserSettings(),
            pullCloudArchives(),
            pullCloudStories(),
            pullVoiceProfiles()
          ]);
          if (archiveOverlay && archiveOverlay.classList.contains('open')) {
          if (state.activeArchiveTab === 'library') {
            renderLibrary();
          } else {
            renderArchives();
          }
        }
      }
    });
  }

  async function pushUserSettingsToCloud() {
    if (!isAuthenticated || !window.db || !window.auth?.currentUser) return;
    try {
      await window.db.collection('users').doc(window.auth.currentUser.uid).collection('settings').doc('credentials').set({
        apiKey: state.apiKey,
        updatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.warn(`User settings sync difficulty, ${state.honorific}:`, err);
    }
  }

  async function pullUserSettings() {
    if (!window.db || !window.auth?.currentUser) return;
    try {
      const doc = await window.db.collection('users').doc(window.auth.currentUser.uid).collection('settings').doc('credentials').get();
      if (doc.exists) {
        const data = doc.data();
        if (data.apiKey) {
          state.apiKey = data.apiKey;
          localStorage.setItem(LS_KEY_API, state.apiKey);
          if (apiKeyInput) apiKeyInput.value = state.apiKey;
        }
      }
    } catch (err) {
      console.warn(`User settings fetch difficulty, ${state.honorific}:`, err);
    }
  }

  async function pullCloudArchives() {
    if (!window.db || !window.auth?.currentUser) return;
    try {
      const snapshot = await window.db
        .collection('users')
        .doc(window.auth.currentUser.uid)
        .collection('conversations')
        .get();

      const cloudConvos = [];
      snapshot.forEach(doc => {
        cloudConvos.push({ id: doc.id, ...doc.data() });
      });

      if (cloudConvos.length > 0) {
        const convoMap = new Map();
        (state.conversations || []).forEach(c => convoMap.set(c.id, c));
        cloudConvos.forEach(c => {
          const local = convoMap.get(c.id);
          if (!local || (c.updatedAt || 0) >= (local.updatedAt || 0)) {
            convoMap.set(c.id, c);
          }
        });
        state.conversations = Array.from(convoMap.values());
        try { localStorage.setItem(LS_KEY_CONVERSATIONS, JSON.stringify(state.conversations)); } catch(e){}

        const active = state.conversations.find(c => c.id === state.activeId);
        if (active && active.history) {
          state.history = active.history;
        }
        if (archiveOverlay && archiveOverlay.classList.contains('open')) {
          renderArchives();
        }
      }
    } catch (err) {
      console.warn(`Cloud fetch difficulty, ${state.honorific}:`, err);
    }
  }

  async function pushStoryToCloud(id, title, rawLit, isNew) {
    if (!isAuthenticated || !window.db || !window.auth?.currentUser) return;
    try {
      const user = window.auth.currentUser;
      const displayName = user.displayName || user.email || 'A family member';
      const payload = {
        title,
        lit: rawLit,
        characters: state.storyCharacters[id] || [],
        updatedAt: Date.now(),
        updatedBy: user.uid,
        updatedByName: displayName
      };
      if (isNew) {
        payload.addedBy = user.uid;
        payload.addedByName = displayName;
        payload.createdAt = Date.now();
      }
      await window.db.collection('stories').doc(id).set(payload, { merge: true });
    } catch (err) {
      console.warn(`Cloud story sync difficulty, ${state.honorific}:`, err);
    }
  }

  async function pullCloudStories() {
    if (!window.db || !window.auth?.currentUser) return;
    try {
      const snapshot = await window.db.collection('stories').get();
      snapshot.forEach(doc => {
        const data = doc.data();
        const id = doc.id;
        state.storyTextCache.set(id, data.lit);
        if (data.characters) state.storyCharacters[id] = data.characters;
        if ((state.storyCatalogue || []).some(s => s.id === id)) {
          state.storyOverrides[id] = data.lit;
        } else {
          const idx = state.customStories.findIndex(s => s.id === id);
          const entry = { id, title: data.title, rawLit: data.lit, addedByName: data.addedByName, createdAt: data.createdAt || 0 };
          if (idx >= 0) {
            state.customStories[idx] = entry;
          } else {
            state.customStories.push(entry);
          }
        }
      });
      try {
        localStorage.setItem(LS_KEY_STORY_OVERRIDES, JSON.stringify(state.storyOverrides));
        localStorage.setItem(LS_KEY_CUSTOM_STORIES, JSON.stringify(state.customStories));
        localStorage.setItem(LS_KEY_STORY_CHARACTERS, JSON.stringify(state.storyCharacters));
      } catch(e){}
      if (archiveOverlay && archiveOverlay.classList.contains('open') && state.activeArchiveTab === 'library') {
        renderLibrary();
      }
    } catch (err) {
      console.warn(`Story library sync difficulty, ${state.honorific}:`, err);
    }
  }

  async function pushVoiceProfilesToCloud() {
    if (!isAuthenticated || !window.db || !window.auth?.currentUser) return;
    try {
      await window.db.collection('voiceProfiles').doc('shared').set({
        profiles: state.voiceProfiles,
        updatedAt: Date.now(),
        updatedBy: window.auth.currentUser.uid
      }, { merge: true });
    } catch (err) {
      console.warn(`Voice profile sync difficulty, ${state.honorific}:`, err);
    }
  }

  async function pullVoiceProfiles() {
    if (!window.db || !window.auth?.currentUser) return;
    try {
      const doc = await window.db.collection('voiceProfiles').doc('shared').get();
      if (doc.exists) {
        const data = doc.data();
        if (data.profiles) {
          state.voiceProfiles = { ...state.voiceProfiles, ...data.profiles };
          try { localStorage.setItem(LS_KEY_VOICE_PROFILES, JSON.stringify(state.voiceProfiles)); } catch(e){}
        }
      }
    } catch (err) {
      console.warn(`Voice profile fetch difficulty, ${state.honorific}:`, err);
    }
  }

  let pendingAttachments = [];

  const JEEVES_BUILD = 'voice-fix-2026-09-26b'; 


  function applyTheme(themeName) {
    if (themeName === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
  applyTheme(state.theme);


  try {
    const savedConversations = localStorage.getItem(LS_KEY_CONVERSATIONS);
    if (savedConversations) {
      state.conversations = JSON.parse(savedConversations);
    } else {
      // First time loading conversations: migrate any pre-existing single-conversation
      // history (from before the archive feature existed) into a "Main Conversation".
      let migratedHistory = [];
      try {
        const savedHistory = localStorage.getItem(LS_KEY_HISTORY);
        if (savedHistory) migratedHistory = JSON.parse(savedHistory);
      } catch(e){ /* ignore malformed legacy history */ }
      state.conversations = [{ id: 'default', title: 'Main Conversation', history: migratedHistory, updatedAt: Date.now() }];
    }
    if (!state.conversations.length) {
      state.conversations = [{ id: 'default', title: 'Main Conversation', history: [], updatedAt: Date.now() }];
    }
  } catch(e){
    state.conversations = [{ id: 'default', title: 'Main Conversation', history: [], updatedAt: Date.now() }];
  }

  {
    const activeConvo = state.conversations.find(c => c.id === state.activeId);
    if (activeConvo) {
      state.history = activeConvo.history || [];
    } else {
      state.activeId = state.conversations[0].id;
      state.history = state.conversations[0].history || [];
    }
  }

  async function generateTitle(history) {
    // Include library catalog in prompt and tool definitions
    const storyTitles = (state.customStories || []).map(s => `"${s.title}" (ID: ${s.id})`).join(', ');
    const systemInstruction = `You are Jeeves. Available stories in library: [${storyTitles}]. If the user asks for a story or accepts a story suggestion, call the read_story tool function with the matching story ID.`;
    const context = history.slice(0, 3).map(turn => turn.parts.map(p => p.text).join(' ')).join(' ').substring(0, 500);
    const url = `https://generativelanguage.googleapis.com/v1beta/${state.model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `Summarize the following into a title of 3-5 words: "${context}"` }] }]
        })
      });
      const data = await resp.json();
      return data.candidates[0].content.parts[0].text.replace(/["']/g, '').trim();
    } catch(e) { return 'New Conversation'; }
  }

  async function refineAllTitles() {
    const btn = document.getElementById('refine-titles-btn');
    let statusSpan = document.getElementById('tidy-status-msg');

    if (!document.getElementById('tidy-anim-style')) {
      const style = document.createElement('style');
      style.id = 'tidy-anim-style';
      style.textContent = `
        @keyframes tidyBorderGlow {
          0% { box-shadow: 0 0 0 1px var(--brass-bright, #d4af37); }
          50% { box-shadow: 0 0 10px 3px var(--brass-bright, #d4af37); border-color: var(--brass-bright, #d4af37) !important; }
          100% { box-shadow: 0 0 0 1px var(--brass-bright, #d4af37); }
        }
        .tidying-border {
          animation: tidyBorderGlow 1.4s infinite ease-in-out !important;
          opacity: 0.9;
        }
      `;
      document.head.appendChild(style);
    }

    if (btn) {
      btn.disabled = true;
      btn.classList.add('tidying-border');
      if (!statusSpan) {
        statusSpan = document.createElement('span');
        statusSpan.id = 'tidy-status-msg';
        statusSpan.style.marginLeft = '8px';
        statusSpan.style.fontSize = '12px';
        statusSpan.style.color = 'var(--mist, #888)';
        statusSpan.style.fontFamily = 'var(--font-ui, sans-serif)';
        btn.insertAdjacentElement('afterend', statusSpan);
      }
      statusSpan.textContent = 'Tidying up…';
    }

    try {
      state.conversations = state.conversations.filter(c => c.history.length > 0 || c.id === 'default');
      const unnamed = state.conversations.filter(c => (c.title === 'New Conversation' || !c.title) && c.history.length > 0);
      for (const convo of unnamed) {
        convo.title = await generateTitle(convo.history);
        convo.updatedAt = Date.now();
        syncConvoToCloud(convo);
      }
      try { localStorage.setItem(LS_KEY_CONVERSATIONS, JSON.stringify(state.conversations)); } catch(e){}
      renderArchives();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('tidying-border');
      }
      if (statusSpan) {
        statusSpan.textContent = '';
      }
    }
  }


  try {
    const savedBlacklist = localStorage.getItem(LS_KEY_BLACKLIST);
    if (savedBlacklist) state.blacklist = JSON.parse(savedBlacklist);
  } catch(e){ state.blacklist = []; }

  try {
    const savedPricing = localStorage.getItem(LS_KEY_PRICING);
    if (savedPricing) state.pricing = JSON.parse(savedPricing);
  } catch(e){ state.pricing = {}; }

  try {
    const savedFetched = localStorage.getItem('jeeves_fetched_models');
    if (savedFetched) state.fetchedModels = JSON.parse(savedFetched);
  } catch(e){ state.fetchedModels = []; }

  function persistBlacklist(){
    localStorage.setItem(LS_KEY_BLACKLIST, JSON.stringify(state.blacklist));
  }
  function getTtsQuota() {
    const saved = localStorage.getItem(LS_KEY_TTS_QUOTA);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${now.getMonth()}`;
    if (saved) {
      const data = JSON.parse(saved);
      if (data.month === currentMonth) return data.count;
    }
    return 0;
  }
  function shortModelName(fullName){
    return (fullName || '').replace(/^models\//, '');
  }

  // ---------- DOM refs ----------
  const chatEl = document.getElementById('chat');
  const inputEl = document.getElementById('input');
  const sendBtn = document.getElementById('send-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const closeModalBtn = document.getElementById('close-modal');
  const modalOverlay = document.getElementById('modal-overlay');
  const apiKeyInput = document.getElementById('api-key');
  const toggleKeyBtn = document.getElementById('toggle-key');
  const honorificInput = document.getElementById('honorific');
  const modelSelect = document.getElementById('model-select');
  const overrideSelects = {
    general: document.getElementById('model-override-general'),
    coding: document.getElementById('model-override-coding'),
    cooking: document.getElementById('model-override-cooking'),
    research: document.getElementById('model-override-research'),
  };
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const refreshAppBtn = document.getElementById('refresh-app-btn');
  const statusArea = document.getElementById('status-area');
  const verifyModelBtn = document.getElementById('verify-model-btn');
  const hiddenModelsNote = document.getElementById('hidden-models-note');
  const freeTierCheck = document.getElementById('free-tier-check');
  const priceInputEl = document.getElementById('price-input');
  const priceOutputEl = document.getElementById('price-output');
  const pricingInputsWrap = document.getElementById('pricing-inputs');
  const sessionTotalNote = document.getElementById('session-total-note');
  const imgPreviewBar = document.getElementById('img-preview-bar');
  const imgPreviewSrc = document.getElementById('img-preview-src');
  const removeImgBtn = document.getElementById('remove-img-btn');
  const attachBtn = document.getElementById('attach-btn');
  const fileInput = document.getElementById('file-input');
  const micBtn = document.getElementById('mic-btn');
  const muteBtn = document.getElementById('mute-btn');

  const ttsAudio = new Audio();
  let ttsUnlocked = false;
  function unlockAudio() {
    if (ttsUnlocked) return;
    ttsAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    ttsAudio.play().then(() => { ttsUnlocked = true; }).catch(() => {});
  }
  let isAutoSpeakEnabled = false;

  const TYPED_HINT = 'Enter to send · Shift+Enter for a new line';
  const VOICE_HINT = 'Say &ldquo;if you please, Jeeves&rdquo; or &ldquo;over to you, Jeeves&rdquo; when you\u2019re finished';

  function updateComposerHint() {
    const hintEl = document.getElementById('composer-hint');
    if (!hintEl) return;
    hintEl.innerHTML = isAutoSpeakEnabled ? VOICE_HINT : TYPED_HINT;
  }

  function toggleAutoSpeak(forcedState, shouldReadLatest = false) {
    isAutoSpeakEnabled = (typeof forcedState === 'boolean') ? forcedState : !isAutoSpeakEnabled;
    updateComposerHint();

    if (muteBtn) {
      muteBtn.classList.toggle('active', isAutoSpeakEnabled);
      muteBtn.setAttribute('data-tooltip', isAutoSpeakEnabled ? 'Voice output: On' : 'Voice output: Off');
      muteBtn.title = isAutoSpeakEnabled ? 'Voice output: On' : 'Voice output: Off';
    }

    if (!isAutoSpeakEnabled) {
      ttsAudio.pause();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    } else if (shouldReadLatest) {
      // Read the most recent model response only when explicitly requested
      const lastModelTurn = [...state.history].reverse().find(t => t.role === 'model');
      if (lastModelTurn) {
        const textPart = (lastModelTurn.parts || []).find(p => p.text);
        if (textPart && textPart.text) {
          speak(textPart.text);
        }
      }
    }
  }

  if (muteBtn) {
    muteBtn.addEventListener('click', () => toggleAutoSpeak(undefined, !isAutoSpeakEnabled));
  }


  
  function clearPendingImages(){
    pendingAttachments = [];
    if (imgPreviewBar) {
      imgPreviewBar.innerHTML = '';
      imgPreviewBar.classList.remove('show');
    }
    if (fileInput) fileInput.value = '';
  }
  
  function handleFile(file){
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const id = Date.now();
      const attachment = file.type.startsWith('image/') 
      ? { id, type: 'image', mimeType: file.type, base64Data: e.target.result.split(',')[1], dataUrl: e.target.result }
      : { id, type: 'text', fileName: file.name, textContent: e.target.result };
      pendingAttachments.push(attachment);
      const thumb = document.createElement('div');
      thumb.className = 'img-thumb-wrap';
      thumb.innerHTML = (attachment.type === 'image' ? `<img src="${attachment.dataUrl}" style="height:60px;border-radius:6px;border:1px solid var(--hairline);">` : `<span style="font-size:12px;padding:6px;background:var(--ink-panel-2);border:1px solid var(--hairline);border-radius:6px;">📄 ${attachment.fileName}</span>`) + `<button type="button" class="img-thumb-remove">&times;</button>`;
      thumb.querySelector('button').onclick = () => { pendingAttachments = pendingAttachments.filter(a => a.id !== id); thumb.remove(); if (!pendingAttachments.length && imgPreviewBar) imgPreviewBar.classList.remove('show'); };
      if (imgPreviewBar) {
        imgPreviewBar.appendChild(thumb);
        imgPreviewBar.classList.add('show');
      }

    };
    file.type.startsWith('image/') ? reader.readAsDataURL(file) : reader.readAsText(file);
  }
  
  
  
  // Paste handler
  document.addEventListener('paste', (e) => {
    const clipboardData = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData);
    if (!clipboardData || !clipboardData.items) return;
    for (const item of clipboardData.items) {
      if (item.kind === 'file') {
        e.preventDefault();
        const file = item.getAsFile();
        handleFile(file);
        break;
      }
    }
  });
  
  // Drag and drop handler
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  });
  
  // Attachment button handlers
  if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files) {
        for(let i = 0; i < e.target.files.length; i++) {
          handleFile(e.target.files[i]);
        }
      }
    });
  }

  
  if (removeImgBtn) removeImgBtn.addEventListener('click', clearPendingImages);
  
  // ---------- Markdown rendering ----------
  if (typeof marked !== 'undefined') {
    marked.setOptions({ breaks: true, gfm: true });
  }
  
  
  function escapeHtml(str){
    return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function addNewTabAffordance(anchor){
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    const icon = document.createElement('span');
    icon.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:baseline;margin-left:4px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>';
    anchor.appendChild(icon.firstChild);
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = '(opens in a new tab)';
    anchor.appendChild(sr);
  }

  
  function handleFootnoteClick(e) {
    const link = e.target.closest('a.footnote-ref, a[href^="#ref-"]');
    if (!link) return;
    e.preventDefault();
    const refId = (link.getAttribute('href') || '').replace(/^#/, '');
    const refEl = document.getElementById(refId);
    if (refEl) {
      refEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      refEl.style.transition = 'background-color 0.4s ease';
      const origBg = refEl.style.backgroundColor;
      refEl.style.backgroundColor = 'var(--ink-panel-2, rgba(212, 175, 55, 0.2))';
      setTimeout(() => { refEl.style.backgroundColor = origBg; }, 1500);
    }
  }

  let footnoteScopeCounter = 0;
  function getFootnoteScope(container){
    if (!container.dataset.footnoteScope) {
      container.dataset.footnoteScope = 'm' + (++footnoteScopeCounter);
    }
    return container.dataset.footnoteScope;
  }
  function renderMarkdownInto(container, rawText){
    const scope = getFootnoteScope(container);
    let text = rawText || '';
    const jeevesCodeBlocks = [];

    // Shield fenced/inline code so citation & LaTeX cleanup can't touch it
      text = text.replace(/```[\s\S]*?```|`[^`\n]*`/g, (m) => {
        jeevesCodeBlocks.push(m);
        return `\u0000JCB${jeevesCodeBlocks.length - 1}\u0000`;
      });

      // Convert basic inline LaTeX like $\text{Na}^+$ or $\text{Cl}^-$ to standard text
      text = text.replace(/\$\\text\{([A-Za-z0-9]+)\}\^\{?([+-]|\d+)\}?\$/g, '$1<sup>$2</sup>');
      text = text.replace(/\$([^$]+)\$/g, '$1');

      // Normalize linked citations and markdown footnotes into standard brackets
      text = text.replace(/\[\^(\d+)\]/g, '[$1]');
      text = text.replace(/\[(\d+(?:\s*,\s*\d+)*)\]\([^)]+\)/g, '[$1]');

    // 1. Convert quote syntax before markdown parsing
    const quoteRegex = /\[\[QUOTE\s+"([^"]*)"\s*\|\s*([^\]]+)\]\]/g;
    text = text.replace(quoteRegex, (match, quoteText, author) => {
      const cleanAuthor = author.trim();
      const url = `https://www.google.com/search?q=${encodeURIComponent(`"${quoteText}" ${cleanAuthor} quote`)}`;
      return `[&ldquo;${quoteText}&rdquo;](${url}) &mdash; *${cleanAuthor}*`;
    });

    // 2. Map all unicode superscripts (¹²³ and ⁰⁴⁵⁶⁷⁸⁹) and carets (^1, ^[1]) to standard brackets
    const unicodeSupMap = {
      '\u00B9': '1', '\u00B2': '2', '\u00B3': '3', '\u2070': '0',
      '\u2074': '4', '\u2075': '5', '\u2076': '6', '\u2077': '7',
      '\u2078': '8', '\u2079': '9'
    };
    text = text.replace(/[\u00B9\u00B2\u00B3\u2070\u2074-\u2079]+(?:\s*,\s*[\u00B9\u00B2\u00B3\u2070\u2074-\u2079]+)*/g, (match) => {
      const parts = match.split(',').map(part => {
        return part.trim().split('').map(ch => unicodeSupMap[ch] || ch).join('');
      });
      return `[${parts.join(', ')}]`;
    });
    text = text.replace(/\^\[?(\d+(?:\s*,\s*\d+)*)\]?/g, '[$1]');

    // 3. Merge adjacent citation groups: [1][2] -> [1, 2]
    text = text.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?:\s*,?\s*\[(\d+(?:\s*,\s*\d+)*)\])+/g, (match) => {
      const nums = match.match(/\d+/g);
      return `[${nums.join(', ')}]`;
    });

    // 4. Convert bracketed citations [1] or [1, 2] (not markdown links) to HTML superscripts
    text = text.replace(/(?<!\[)\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, (match, numsGroup) => {
      const links = numsGroup.split(',').map(n => n.trim()).filter(Boolean).map(num => {
        return `<a href="#ref-${scope}-${num}" class="footnote-ref" data-ref="${num}">${num}</a>`;
      });
      return `<sup style="color:var(--brass-bright);">${links.join(', ')}</sup>`;
    });

      // Restore the code/inline-code segments shielded above, completely untouched
      text = text.replace(/\u0000JCB(\d+)\u0000/g, (_, i) => jeevesCodeBlocks[Number(i)]);

    // 5. Parse Markdown and sanitize HTML
    const parser = (typeof marked !== 'undefined') ? marked : { parse: (t) => t };
    let html = parser.parse(text);

    if (window.DOMPurify) {
      container.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
    } else {
      console.error("Jeeves: Security risk! DOMPurify failed to load.");
      container.textContent = "Error: Security components failed to load.";
      return;
    }

    // Robustly extract and format the References section into an <ol> with unique id per item
    const refHeaders = Array.from(container.querySelectorAll('h1, h2, h3, h4, p')).filter(el => {
      const txt = el.textContent.trim();
      return /^#*\s*(references|sources|citations|footnotes)\b/i.test(txt) || /^(references|sources|citations|footnotes)\b/i.test(el.querySelector('strong')?.textContent?.trim() || '');
    });

    refHeaders.forEach(headerEl => {
      let next = headerEl.nextElementSibling;
      let refEntries = [];
      const nodesToRemove = [];

      // If references are trapped inside the header <p> itself (separated by <br>)
      if (headerEl.tagName === 'P' && headerEl.innerHTML.includes('<br')) {
        const parts = headerEl.innerHTML.split(/<br\s*\/?>/i).map(l => l.trim()).filter(Boolean);
        if (parts.length > 1) {
          headerEl.innerHTML = parts[0]; // keep only the header line
          refEntries.push(...parts.slice(1));
        }
      }

      while (next) {
        if (next.tagName === 'OL' || next.tagName === 'UL') {
          next.querySelectorAll('li').forEach(li => refEntries.push(li.innerHTML));
          nodesToRemove.push(next);
          break;
        } else if (next.tagName === 'P') {
          const lines = next.innerHTML.split(/<br\s*\/?>|\n/).map(l => l.trim()).filter(Boolean);
          refEntries.push(...lines);
          nodesToRemove.push(next);
          next = next.nextElementSibling;
        } else {
          break;
        }
      }

      if (refEntries.length > 0) {
        nodesToRemove.forEach(n => n.remove());
        const ol = document.createElement('ol');
        ol.style.paddingLeft = '22px';
        ol.style.margin = '0 0 10px';

        refEntries.forEach((entryHtml, idx) => {
          const num = idx + 1;
          const cleanEntry = entryHtml
            .replace(/^<p>\s*/i, '<p>')
            .replace(/(<p>)?(?:\d+\.|\(\d+\)|\[\d+\]|<sup[^>]*>.*?<\/sup>)\s*(?:\d+\.|\(\d+\)|\[\d+\]|<sup[^>]*>.*?<\/sup>)?\s*/i, '$1');
          const li = document.createElement('li');
          li.id = `ref-${scope}-${num}`;
          li.innerHTML = cleanEntry;
          ol.appendChild(li);
        });

        headerEl.insertAdjacentElement('afterend', ol);
      }
    });

    // Despite instructions, the model occasionally writes an inline citation as a
    // real hyperlink straight to the source (e.g. "claim [1](https://example.com)")
    // instead of a bare [1] — likely echoing the linked-URL style used in the
    // References entries themselves. marked() turns that into a plain <a> before any
    // of the bracket/sup handling below ever sees it, so it would otherwise render as
    // an unstyled inline link rather than a footnote. Recognize it by matching its
    // href against a URL already present in the References list, and restyle it to
    // match the rest of the footnotes.
    const refUrlToNum = {};
    container.querySelectorAll('ol li[id^="ref-"]').forEach(li => {
      const num = li.id.slice(4 + scope.length + 1);
      const link = li.querySelector('a[href]');
      if (link) refUrlToNum[link.getAttribute('href')] = num;
    });
    if (Object.keys(refUrlToNum).length) {
      container.querySelectorAll('a[href]').forEach(a => {
        if (a.classList.contains('footnote-ref')) return;
        const num = refUrlToNum[a.getAttribute('href')];
        if (num && /^\d+$/.test(a.textContent.trim())) {
          const sup = document.createElement('sup');
          sup.style.color = 'var(--brass-bright)';
          sup.innerHTML = `<a href="#ref-${scope}-${num}" class="footnote-ref" data-ref="${num}">${num}</a>`;
          a.replaceWith(sup);
        }
      });
    }

    // Also wrap existing <sup> tags if the model output raw <sup>1</sup> or <sup>1, 2</sup>
    container.querySelectorAll('sup').forEach(sup => {
      if (sup.querySelector('.footnote-ref')) return;
      const raw = sup.textContent.trim();
      if (/^\d+(?:\s*,\s*\d+)*$/.test(raw)) {
        sup.style.color = 'var(--brass-bright)';
        const nums = raw.split(',').map(n => n.trim()).filter(Boolean);
        sup.innerHTML = nums.map(num => `<a href="#ref-${scope}-${num}" class="footnote-ref" data-ref="${num}">${num}</a>`).join(', ');
      }
    });



    // Format actionable links (Calendar, Maps, SMS, Mailto, Tel) into button chips
    container.querySelectorAll('a').forEach(link => {
      const href = link.getAttribute('href') || '';
      const isAction = /^(mailto:|sms:|tel:|geo:|https?:\/\/(?:[a-z0-9-]+\.)*(?:calendar\.google\.com|google\.com\/maps|maps\.google\.com|maps\.apple\.com|goo\.gl\/maps|maps\.app\.goo\.gl|waze\.com))/i.test(href);
      if (isAction) {
        link.classList.add('action-link-btn');
      } else if (!link.classList.contains('footnote-ref') && !href.startsWith('#') && !link.querySelector('.sr-only')) {
        addNewTabAffordance(link);
      }
    });

    container.querySelectorAll('pre code').forEach(codeEl => {
      const pre = codeEl.parentElement;
      if (!pre || !pre.parentNode || pre.parentNode.classList.contains('code-wrap') || pre.parentNode.classList.contains('prose-copy-wrap')) return;

      const langMatch = (codeEl.className || '').match(/language-(\S+)/);
      const lang = langMatch ? langMatch[1].toLowerCase() : '';

      const isProseCard = state.convoType !== 'coding' || ['copy', 'draft', 'quote'].includes(lang);

      if (isProseCard) {
        const rawNote = codeEl.textContent.trim();
        const wrap = document.createElement('div');
        wrap.className = 'prose-copy-wrap';

        const textDiv = document.createElement('div');
        textDiv.className = 'prose-copy-text';
        textDiv.textContent = rawNote;
        wrap.appendChild(textDiv);

        const dogEar = document.createElement('div');
        dogEar.className = 'dog-ear';
        dogEar.innerHTML = `
          <div class="dog-ear__paper"></div>
          <div class="dog-ear__shadow"></div>
          <div class="dog-ear__back"></div>
        `;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'corner-copy-btn';
        copyBtn.type = 'button';
        copyBtn.title = 'Copy note';
        copyBtn.setAttribute('aria-label', 'Copy note');
        
        const copyIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        const checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        copyBtn.innerHTML = copyIcon;

        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(rawNote).then(() => {
            copyBtn.innerHTML = checkIcon;
            setTimeout(() => { copyBtn.innerHTML = copyIcon; }, 1600);
          });
        });

        dogEar.appendChild(copyBtn);
        wrap.appendChild(dogEar);
        pre.parentNode.replaceChild(wrap, pre);
        return;
      }

      try {

        if (window.hljs) hljs.highlightElement(codeEl);
        const wrap = document.createElement('div');
        wrap.className = 'code-wrap';
        const head = document.createElement('div');
        head.className = 'code-head';
        head.innerHTML = `<span>${escapeHtml(lang || 'code')}</span>`;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.type = 'button';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(codeEl.textContent).then(() => {
            copyBtn.textContent = 'Copied';
          });
        });

        head.appendChild(copyBtn);
        pre.parentNode.insertBefore(wrap, pre);
        wrap.appendChild(head);
        wrap.appendChild(pre);
      } catch(e){ console.warn('Jeeves: skipped code block wrap', e); }
    });

    // Delegated event listener for footnote navigation
    container.removeEventListener('click', handleFootnoteClick);
    container.addEventListener('click', handleFootnoteClick);
  }

    // Sources that are rarely citation-worthy (crowdsourced Q&A, social feeds)
  // even though Google Search sometimes surfaces them. Filtered out before
  // they ever reach the References list.
  const LOW_QUALITY_SOURCE_PATTERNS = [
    'quora.com', 'facebook.com', 'reddit.com', 'pinterest.com', 'tiktok.com',
    'answers.yahoo.com', 'ask.com', 'twitter.com', 'x.com', 'instagram.com',
    'ehow.com', 'youtube.com', 'youtu.be', 'wikipedia.org'
  ];

  function isLowQualityGroundingChunk(chunk){
    const web = chunk && chunk.web;
    if (!web) return true;
    const hay = `${web.title || ''} ${web.uri || ''}`.toLowerCase();
    return LOW_QUALITY_SOURCE_PATTERNS.some(p => hay.includes(p));
  }

  // Enhances the model's citations and references with verified Google Search grounding URIs
  function applyGroundingFootnotes(rawText, chunks, supports){
    if (!chunks || !chunks.length) return rawText;

    const keptChunks = chunks.filter(c => !isLowQualityGroundingChunk(c));
    if (!keptChunks.length) return rawText;

    let text = rawText;

    // If the model wrote its own references, verify and inject real grounding URIs if missing
    if (/#{2,3}\s*References/i.test(text)) {
      keptChunks.forEach((chunk, i) => {
        const uri = chunk.web && chunk.web.uri;
        if (!uri) return;
        // If the reference line lacks a functioning URL, supply the grounded URI
        const refLineRegex = new RegExp(`(^|\\n)(${i + 1}\\.\\s*According to [^\\n]+)`, 'i');
        text = text.replace(refLineRegex, (m, prefix, line) => {
          if (!line.includes('http')) {
            return `${prefix}${line} ([Source Link](${uri}))`;
          }
          return m;
        });
      });
      return text;
    }

    // Fallback: If no references section was produced, return text without synthetic boilerplate
    return text;
  }




  
  
  // ---------- Chat rendering ----------
  function scrollToBottom(){
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
  }
  
  function clearChatDom(){
    if (chatEl) chatEl.innerHTML = '';
  }

  
  function renderEmptyState(){
    clearChatDom();
    if (!chatEl) return;
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';
    wrap.innerHTML = `
    <img src="Jeeves.png" alt="Jeeves" class="crest-img" style="width:64px;height:64px;margin:0 auto 18px;">
    <h2>Good day.</h2>
    <p>Jeeves stands ready, though he requires a Gemini API key before he may attend to your affairs.</p>
    <button id="empty-settings-btn">Open Settings</button>
    `;
    
    chatEl.appendChild(wrap);
    document.getElementById('empty-settings-btn').addEventListener('click', openModal);
  }
  
  function messageRow(role){
    const row = document.createElement('div');
    row.className = 'msg-row ' + role;
    let avatar;
    if (role === 'model') {
      avatar = document.createElement('img');
      avatar.src = 'Jeeves.png';
      avatar.alt = 'Jeeves';
      avatar.className = 'avatar-img';
    } else {
      avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.textContent = 'Y';
    }
    const bubble = document.createElement('div');
    
    bubble.className = 'bubble';
    row.appendChild(avatar);
    row.appendChild(bubble);
    return { row, bubble };
  }
  
  function addUserMessage(text, imageDataUrl){
    const { row, bubble } = messageRow('user');
    if (imageDataUrl) {
      const img = document.createElement('img');
      img.src = imageDataUrl;
      img.className = 'bubble-img';
      bubble.appendChild(img);
    }
    if (text) {
      const txtSpan = document.createElement('span');
      txtSpan.textContent = text;
      bubble.appendChild(txtSpan);
    }
    if (chatEl) chatEl.appendChild(row);
    scrollToBottom();
  }
  
  
  function addSystemNote(text){
    const row = document.createElement('div');
    row.className = 'msg-row system-note';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    if (chatEl) chatEl.appendChild(row);
    scrollToBottom();

  }
  
  function playListeningChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      [1046.5, 1567.98].forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      });
    } catch(e) {}
  }

  function getJeevesVoice() {
    const voices = speechSynthesis.getVoices();
    const isRegina = state.persona === 'regina';
    if (isRegina) {
      const femalePreferred = voices.find(v => v.name.includes('Google UK English Female')) ||
                              voices.find(v => v.lang.startsWith('en-GB') && /female|woman|alice|fiona|hazel|victoria|kate/i.test(v.name)) ||
                              voices.find(v => v.lang.startsWith('en-GB'));
      return femalePreferred || voices[0];
    }
    const preferred = voices.find(v => v.name.includes('Google UK English Male')) ||
                      voices.find(v => v.name.includes('Google UK English Female')) ||
                      voices.find(v => v.lang.startsWith('en-GB') && v.name.includes('Google')) ||
                      voices.find(v => v.lang.startsWith('en-GB'));
    return preferred || voices[0];
  }

  
  function prepareSpeechText(text) {
    if (!text) return '';
    let speech = text;
    // Transform quotation mark entities and characters into spoken quote markers
    // Handle initials (e.g., P.G. Wodehouse -> P G Wodehouse) to prevent terminal stops
    speech = speech.replace(/\b([A-Z])\.(?=\s*[A-Z]\.|\s+[A-Z][a-z])/g, '$1 ');
    speech = speech.replace(/\b([A-Z])\.(?=\s)/g, '$1');

    // Replace quotation marks with soft pauses instead of literal spoken labels
    speech = speech.replace(/&ldquo;|&#8220;|“/gi, ', ').replace(/&rdquo;|&#8221;|”/gi, ', ');
    speech = speech.replace(/"([^"\n]+)"/g, ', $1, ');

    // Clean up punctuation collisions and redundant pauses
    speech = speech.replace(/\s*,\s*,+/g, ', ').replace(/,\s*([.?!])/g, '$1').replace(/\s{2,}/g, ' ');

    speech = speech.replace(/&[a-z0-9#]+;/gi, ' ');

    // Read only link labels from markdown links [label](url)
    speech = speech.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    // Strip remaining bare URLs
    speech = speech.replace(/https?:\/\/\S+/g, '');
    // Strip HTML markup (e.g. footnote tags)
    speech = speech.replace(/<[^>]*>/g, '');
    // Clean remaining markdown formatting characters
    speech = speech.replace(/(\*\*|__|\*|_|#|`|~)/g, '');
    return speech.trim();
  }

  let speechQueue = [];
  let isSpeaking = false;
  let pendingSpokenReferences = null;
  let lastSpokenText = '';
  const audioPrefetchCache = new Map(); // rawText -> Promise<string|null> (blob URL)

  function stopSpeech() {
    speechQueue = [];
    isSpeaking = false;
    lastSpokenText = '';
    ttsAudio.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  function speak(text) {
    if (!text) return;
    speechQueue.push(text);
    processSpeechQueue();
  }

  function sanitizeForSpeech(rawText) {
    let cleanText = rawText
      .replace(/```(?:copy|draft|quote)\b[^\n]*\n?/gi, ` Here is a note I have prepared for you to copy, ${state.honorific}: `)
      .replace(/```[a-zA-Z0-9_-]*\b[^\n]*\n?/g, ' ')
      .replace(/```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/`+/g, '')
      .replace(/(\*\*|__|\*|_|#)/g, '');

          // Handle initials (e.g. P.G. Wodehouse -> P G Wodehouse) to avert sentence-ending pauses
      cleanText = cleanText.replace(/\b([A-Z])\.(?=\s*[A-Z]\.|\s+[A-Z][a-z])/g, '$1 ');
      cleanText = cleanText.replace(/\b([A-Z])\.(?=\s)/g, '$1');

      // Replace quotation marks with conversational pauses instead of verbalized words
      cleanText = cleanText
        .replace(/&ldquo;|&#8220;|“/gi, ', ')
        .replace(/&rdquo;|&#8221;|”/gi, ', ')
        .replace(/"([^"\n]+)"/g, ', $1, ');

      // Normalize multiple commas and punctuation collisions
      cleanText = cleanText.replace(/\s*,\s*,+/g, ', ').replace(/,\s*([.?!])/g, '$1').replace(/\s{2,}/g, ' ');

    cleanText = cleanText.replace(/&mdash;|—/g, '. ');
    cleanText = cleanText.replace(/&[a-z0-9#]+;/gi, ' ');
    // Action button links (Maps, Calendar, Email, SMS, Tel): speak only the button label
    cleanText = cleanText.replace(/\[([^\]]+)\]\((?:https?:\/\/(?:[a-z0-9-]+\.)*(?:calendar\.google\.com|google\.com\/maps|maps\.google\.com|maps\.apple\.com|goo\.gl\/maps|maps\.app\.goo\.gl|waze\.com)|mailto:|sms:|tel:|geo:)[^)]*\)/gi, '$1. ');

    // Standard markdown links: speak label + ", link.", or just "link" if the label is a URL
    cleanText = cleanText.replace(/\[([^\]]+)\]\([^)]+\)/g, (match, label) => {
      return /^https?:\/\/|^www\./i.test(label.trim()) ? 'link.' : `${label}, link.`;
    });

    cleanText = cleanText.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (m, g) => ' footnote ' + g.split(',').map(n => n.trim()).join(', footnote ') + '. ');
    cleanText = cleanText.replace(/\n+/g, '. ');
    cleanText = cleanText.replace(/https?:\/\/\S+|www\.\S+/gi, '');
    cleanText = cleanText.replace(/(mailto|sms|tel|geo):\S+/gi, '');
    cleanText = cleanText.replace(/<[^>]*>/g, '').trim();
    return cleanText;
  }

  async function fetchTtsBlobUrl(cleanText, pitch = 0, rate = 1.0) {
    try {
      const resp = await fetch('https://us-central1-jeeves-login-6391e.cloudfunctions.net/synthesizeSpeech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          pitch: pitch,
          rate: rate,
          persona: state.persona,
          gender: state.persona === 'regina' ? 'FEMALE' : 'MALE',
          userId: window.auth?.currentUser?.uid
        })
      });
      return resp.ok ? URL.createObjectURL(await resp.blob()) : null;
    } catch (e) { return null; }
  }


  function prefetchTts(rawText) {
    if (!rawText || audioPrefetchCache.has(rawText)) return;
    const cleanText = sanitizeForSpeech(rawText);
    if (cleanText) audioPrefetchCache.set(rawText, fetchTtsBlobUrl(cleanText));
  }

  async function processSpeechQueue() {
    if (isSpeaking || speechQueue.length === 0) return;
    isSpeaking = true;
    stopListening();
    const rawText = speechQueue.shift();
    const cleanText = sanitizeForSpeech(rawText);

    if (speechQueue.length > 0 && getTtsQuota() < 980000) prefetchTts(speechQueue[0]);

    if (cleanText) {
      lastSpokenText = cleanText;
      const quota = getTtsQuota();
      let playedCloud = false;

      if (quota < 980000) {
        try {
          const audioUrl = audioPrefetchCache.has(rawText)
            ? await audioPrefetchCache.get(rawText)
            : await fetchTtsBlobUrl(cleanText);
          audioPrefetchCache.delete(rawText);
          if (audioUrl) {
            await new Promise((resolve) => {
              ttsAudio.src = audioUrl;
              ttsAudio.playbackRate = state.ttsRate || 1.0;
              ttsAudio.onended = resolve;
              ttsAudio.onerror = resolve;
              ttsAudio.play().catch(resolve);
            });
            playedCloud = true;
          }
        } catch (e) { console.warn("Cloud TTS failed, falling back to browser voice."); }
      }

      if (!playedCloud && 'speechSynthesis' in window) {
        await new Promise((resolve) => {
          const u = new SpeechSynthesisUtterance(cleanText);
          const voice = getJeevesVoice();
          if (voice) u.voice = voice;
          u.rate = state.ttsRate || 1.0; u.pitch = 0.9;
          u.onend = resolve;
          u.onerror = resolve;
          speechSynthesis.speak(u);
        });
      }
    }

    isSpeaking = false;
    if (speechQueue.length > 0) {
      processSpeechQueue();
    } else if (isAutoSpeakEnabled) {
      if (pendingSpokenReferences || /\?\s*$/.test(lastSpokenText)) {
        startListening();
      }
    }
  }


  // Reads a library story aloud via JeevesReader once Jeeves finishes his spoken lead-in.
  async function startStoryFromChat(spec){
    const restart = /:START$/i.test(spec);
    const storyId = spec.replace(/:(START|RESUME)$/i, '');
    const story = (state.customStories || []).find(s => s.id === storyId);
    if (!story) return;
    const text = await preloadStoryText(story);
    if (!text) return;
    while (isSpeaking || speechQueue.length > 0) await new Promise(r => setTimeout(r, 250));
    stopListening();
    if (restart) state.readerProgress[story.id] = 0;
    JeevesReader.load(text, story.id);
    showReaderBar(story.title);
    JeevesReader.play().then(updateReaderBar);
  }

  function addModelMessagePlaceholder(){
    const { row, bubble } = messageRow('model');
    const phrases = [
      `Allow me to consider that, ${state.honorific}.`,
      `Let me ponder the particulars of your request for a moment.`,
      `One moment, ${state.honorific}; let me turn that over in my mind.`,
      `I shall examine the matter forthwith, ${state.honorific}.`,
      `If you would be so kind as to wait a moment, I am looking into that.`,
      `Just a brief pause, ${state.honorific}, while I arrange my thoughts.`
    ];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    bubble.innerHTML = `<span style="font-family:var(--font-ui); font-size:14px; color:var(--mist);">${phrase}</span>`;    
    if (chatEl) chatEl.appendChild(row);
    scrollToBottom();
    return { row, bubble, phrase };
  }

  function buildMetaLine(usage, modelName, timestamp){
    if (!usage) return null;
    const meta = document.createElement('div');
    meta.className = 'meta-line';
    const stamp = timestamp ? new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown time';
    const inTok = usage.promptTokenCount || 0;
    const outTok = usage.candidatesTokenCount || 0;
    const totTok = usage.totalTokenCount || (inTok + outTok);
    const cost = computeCost(usage, modelName);
    const costText = cost === null ? 'cost unset' : formatCost(cost);
    meta.textContent = `${stamp} · ${shortModelName(modelName)} · ${inTok}→${outTok} tokens (${totTok} total) · ${costText}`;
    return meta;
  }

  function updateApp() {
    // Force a reload and clear cache by appending a timestamp
    const baseUrl = window.location.href.split('?')[0];
    window.location.href = `${baseUrl}?update=${new Date().getTime()}`;
  }


  function replayHistory(){
    clearChatDom();
    if (!state.history.length){
      if (!state.apiKey) { renderEmptyState(); return; }
      addSystemNote('Jeeves awaits your instruction.');
      return;
    }
    state.history.forEach(turn => {
      const textPart = (turn.parts || []).find(p => p.text);
      const imagePart = (turn.parts || []).find(p => p.inlineData || p.inline_data);
      const text = textPart ? textPart.text : '';
      const imgData = imagePart ? (imagePart.inlineData || imagePart.inline_data) : null;
      const imgUrl = imgData ? `data:${imgData.mimeType || imgData.mime_type};base64,${imgData.data}` : null;

      if (turn.role === 'user'){
        addUserMessage(text, imgUrl);
      } else {
        const { row, bubble } = messageRow('model');
        renderMarkdownInto(bubble, text);
        if (turn.usage) {
          const meta = buildMetaLine(turn.usage, turn.model, turn.timestamp);
          if (meta) bubble.appendChild(meta);
        }
        if (chatEl) chatEl.appendChild(row);
      }
    });
    scrollToBottom();
  }

  // ---------- Persona ----------
  function buildSystemInstruction(){
    const h = (state.honorific || 'Sir').trim() || 'Sir';
    const isRegina = state.persona === 'regina';
    const name = isRegina ? 'Regina Jeeves' : 'Reginald Jeeves';
    const role = isRegina
      ? "an impeccably erudite and unflappable lady-in-waiting in the tradition of P.G. Wodehouse"
      : "an impeccably erudite and unflappable gentleman's gentleman in the tradition of P.G. Wodehouse";
    let instructions = `You are Reginald Jeeves, an impeccably erudite and unflappable gentleman's gentleman in the tradition of P.G. Wodehouse. You address the person you serve as "${h}". Your purpose is to be a genuinely useful, accurate, and efficient personal assistant. Your persona is a matter of tone and manner: keep responses concise, accurate, and structured. Always use Google Search to ground factual claims in authoritative sources. Every factual claim in your response MUST be followed immediately by an inline numeric citation marker in bare brackets (e.g. 'Northern flying squirrels are strictly nocturnal [1, 2].'). At the end of every response containing factual claims, provide a '### References' section formatted as a numbered list matching the inline markers (e.g. According to [Source Name], [brief domain credibility note], [key finding as link text](URL)). Never list a reference at the bottom that is not cited inline in the body text, and never place raw URLs in inline prose. Whenever you quote from great literature, historical figures, or book characters, incorporate the author's name (and the character's name if applicable) into the prose leading up to the quote, and format only the quote itself as a Google search link wrapped in double quotation marks (e.g. In the words of J.R.R. Tolkien's character, Sam Gamgee, ["There's some good in this world, Mr. Frodo, and it's worth fighting for."](https://www.google.com/search?q=%22There%27s%20some%20good%20in%20this%20world%22%20Tolkien%20quote)). Do not append an em-dash or author attribution after the quote.
      - Mobile Action Links: When scheduling, navigating, or composing drafts, proactively provide markdown links with actionable intents (e.g. [Add to Calendar](https://calendar.google.com/calendar/render?action=TEMPLATE&text=...), [Directions](https://www.google.com/maps/dir/?api=1&destination=...), [Send Email](mailto:...?subject=...&body=...), [Send SMS](sms:?body=...)).`;
    if (state.convoType === 'coding') {
      instructions += `\n- You are in 'Coding Help' mode. ALWAYS use small, highly targeted replacements. Favor a micro-replacement strategy over replacing large blocks. Ensure all code blocks, commands, or file paths remain clean and syntactically precise. You must use this pattern for modifications:
      Paste this:
      [targeted new code]
      Over this:
      [existing code]`;
    } else if (state.convoType === 'general') {
      instructions += `\n- You are in 'General Conversation' mode. If you provide any draft text (emails, messages, search terms, quotes, etc.), please present the final result within a \`\`\`copy block for easy copying.`;
    } else if (state.convoType === 'cooking') {
      instructions += `\n- You are in 'Culinary Advice' mode. Justify your recommendations by referring to reputable cooking blogs or resources by name (e.g. "Serious Eats", "Kenji López-Alt's method"). Use Google Search to find these sources. Do NOT type out URLs yourself — the application will automatically append a verified list of the sources you found via search beneath your answer, so simply mention sources by name in your prose. After explaining the suggestion, if there's enough information in the conversation to compose an entire recipe, put the entirety in a code block for easy copying`;
    } else if (state.convoType === 'research') {
      instructions += `\n- You are in 'Research Assistance' mode. Use Google Search to ground your claims in verified, authoritative sources. Cite every claim inline with a footnote marker (following the bare-bracket rule above) placed immediately after the relevant punctuation. At the end of your response, provide a '### References' section formatted as a numbered markdown list, one entry per footnote number in order. Format each reference entry as: "According to [Source Name], [brief statement on source credibility and domain authority], " followed immediately by the key finding itself written AS the link text — e.g. According to Discovery, a premier science education network, [the Komodo dragon is the largest extant lizard, reaching up to ten feet in length](URL). The opening bracket must come right after the credibility clause, the closing bracket must sit right before "(URL)" with nothing in between, and the raw URL must never appear anywhere else in the entry — not as plain text, and not a second time. Use the exact live URLs discovered via Google Search.\n`;
    }



    const readable = (state.customStories || []).filter(st => st.id && st.title);
    if (readable.length) {
      const list = readable.map(st => {
        const n = (state.storyTextCache.get(st.id) || st.rawLit || '').split(/\r?\n/).filter(l => l.trim()).length;
        const at = state.readerProgress[st.id] || 0;
        const mark = (at > 0 && at < n) ? `, bookmarked at ${Math.round(at / n * 100)}%` : '';
        return `"${st.title}" (ID: ${st.id}${mark})`;
      }).join(', ');
      instructions += `\n- Story Library: you can read these stories aloud: ${list}.\n  STORY PROTOCOL: (1) If the person asks for a story without naming one, or the moment suits it, offer exactly ONE title by name, phrased as a question, and do not list the others. Do not include the marker in an offer. (2) If they decline, acknowledge it in a few gracious words and offer a different title they have not yet declined; if none remain, say so and ask what else you might do. (3) If they accept, or name a story themselves, and that story has NO bookmark, reply with exactly one short sentence in the form "Here is <Title>, ${h}:" followed by the marker [[READ_STORY:ID]]. (4) If the story they chose IS marked as bookmarked, do not start yet: ask in one brief question whether they would like it from the beginning or resumed where you last left off, and include no marker. If they already said which in their request, skip the question. (5) Once they answer, reply with one short sentence, either "Here is <Title>, ${h}:" for the beginning or "Resuming <Title> where we left off, ${h}:" for resuming, followed by the marker [[READ_STORY:ID:START]] or [[READ_STORY:ID:RESUME]] accordingly. Replies that carry a marker must not end with a question, and this overrides any other instruction to end with a follow-up question. (6) Never include a marker unless the person has just accepted or named a story and, where required, chosen beginning or resume. Do not use Google Search or add references for story requests.`;
    }
    return instructions;
  }




  // ---------- Settings modal ----------
  function openModal() {
    // Map of IDs to their corresponding state values
    const fields = {
      'api-key': state.apiKey,
      'honorific': state.honorific,
      'tts-rate-slider': state.ttsRate,
      'tts-rate-input': state.ttsRate
    };
    const rateValEl = document.getElementById('tts-rate-val');
    if (rateValEl) rateValEl.textContent = Number(state.ttsRate).toFixed(2);

    // Safely populate inputs
    Object.keys(fields).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = fields[id] || '';
    });

    // Handle theme radio buttons safely
    const currentThemeRadio = document.querySelector(`input[name="theme"][value="${state.theme}"]`);
    if (currentThemeRadio) currentThemeRadio.checked = true;

    const currentPersonaRadio = document.querySelector(`input[name="persona"][value="${state.persona}"]`);
    if (currentPersonaRadio) currentPersonaRadio.checked = true;

    if (statusArea) statusArea.innerHTML = '';
    if (hiddenModelsNote) hiddenModelsNote.style.display = 'none';
    if (modalOverlay) modalOverlay.classList.add('open');

    const submitSuggBtn = document.getElementById('submit-suggestion-btn');
    if (submitSuggBtn) {
      submitSuggBtn.onclick = submitUserSuggestion;
    }

    if (state.apiKey) {
      fetchModels(state.apiKey, state.model);
    } else if (modelSelect) {
      modelSelect.disabled = true;
      modelSelect.innerHTML = '<option value="">Enter a valid API key to fetch available models…</option>';
    }
    
    if (state.model && typeof loadPricingFieldsForModel === 'function') {
      loadPricingFieldsForModel(state.model);
    }
      // reveal Regina voice option
    const personaField = document.getElementById('persona-field');
    let clickCount = 0;
    const sectionHeader = document.querySelector('.settings-section:has(#persona-field) .section-header');
    if (sectionHeader) {
      sectionHeader.onclick = () => {
        clickCount++;
        if (clickCount >= 3) personaField.style.display = 'block';
      };
    }
  }


  function closeModal(){
    modalOverlay.classList.remove('open');
  }

  function setStatus(kind, text){
    if (!text){ statusArea.innerHTML = ''; return; }
    statusArea.innerHTML = `<div class="status-msg ${kind} show">${escapeHtml(text)}</div>`;
  }

  function loadPricingFieldsForModel(modelName){
    const entry = state.pricing[modelName];
    if (entry && entry.free) {
      freeTierCheck.checked = true;
      pricingInputsWrap.style.display = 'none';
    } else {
      freeTierCheck.checked = false;
      pricingInputsWrap.style.display = 'flex';
      priceInputEl.value = entry && entry.inputPerM != null ? entry.inputPerM : '';
      priceOutputEl.value = entry && entry.outputPerM != null ? entry.outputPerM : '';
    }
    updateSessionTotalNote();
  }

  function computeCost(usage, modelName){
    if (!usage) return null;
    const entry = state.pricing[modelName];
    if (!entry) return null;
    if (entry.free) return 0;
    const inRate = parseFloat(entry.inputPerM);
    const outRate = parseFloat(entry.outputPerM);
    if (isNaN(inRate) && isNaN(outRate)) return null;
    const inputTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;
    const cost = (inputTokens / 1e6) * (isNaN(inRate) ? 0 : inRate) + (outputTokens / 1e6) * (isNaN(outRate) ? 0 : outRate);
    return cost;
  }

  function formatCost(cost){
    if (cost === 0) return 'Free tier';
    if (cost < 0.01) return '~$' + cost.toFixed(4);
    return '~$' + cost.toFixed(2);
  }

  function updateSessionTotalNote(){
    let total = 0;
    let counted = 0;
    let missingPricing = false;
    state.history.forEach(turn => {
      if (turn.role !== 'model' || !turn.usage) return;
      const cost = computeCost(turn.usage, turn.model);
      if (cost === null) { missingPricing = true; return; }
      total += cost;
      counted++;
    });
    if (counted === 0) {
      sessionTotalNote.textContent = 'No priced responses yet this session — reply once with pricing set to see a running total.';
    } else {
      sessionTotalNote.textContent = `Running total across ${counted} priced response${counted === 1 ? '' : 's'} in your saved history: ${formatCost(total)}` + (missingPricing ? ' (some responses used models without pricing set, and are excluded).' : '.');
    }
  }

  async function fetchModels(apiKey, preferredModel){
    modelSelect.disabled = true;
    modelSelect.innerHTML = '<option value="">Fetching model catalogue…</option>';
    setStatus('loading', 'Consulting the Gemini model catalogue…');

    let data;
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        const msg = (errBody && errBody.error && errBody.error.message) || `Request failed with status ${resp.status}`;
        throw new Error(msg);
      }
      data = await resp.json();
    } catch (err) {
      modelSelect.innerHTML = '<option value="">Unable to fetch models</option>';
      modelSelect.disabled = true;
      setStatus('error', 'I regret to report the model catalogue could not be retrieved: ' + err.message);
      return;
    }

    const rawModels = (data && data.models) || [];
    const allUsable = rawModels.filter(m => {
      const methods = m.supportedGenerationMethods || [];
      if (!methods.includes('generateContent')) return false;
      const name = (m.name || '').toLowerCase();
      if (name.includes('embedding')) return false;
      if (name.includes('bison')) return false;
      if (name.includes('aqa')) return false;
      if (name.includes('-exp')) return false;
      if (name.includes('vision')) return false;
      return true;
    });

    const usable = allUsable.filter(m => !state.blacklist.includes(m.name));
    const hiddenCount = allUsable.length - usable.length;

    if (!allUsable.length) {
      modelSelect.innerHTML = '<option value="">No compatible models found for this key</option>';
      modelSelect.disabled = true;
      setStatus('error', 'No models supporting generateContent were found for this key. Please verify the key has the Generative Language API enabled.');
      return;
    }

    if (!usable.length) {
      modelSelect.innerHTML = '<option value="">All fetched models were previously found unavailable</option>';
      modelSelect.disabled = true;
      hiddenModelsNote.style.display = 'block';
      hiddenModelsNote.innerHTML = `All ${hiddenCount} model(s) returned by this key previously failed verification. <a href="#" id="reset-blacklist-link">Reset and show them again</a>.`;
      document.getElementById('reset-blacklist-link').addEventListener('click', (e) => {
        e.preventDefault();
        state.blacklist = [];
        persistBlacklist();
        fetchModels(apiKey, preferredModel);
      });
      setStatus('error', 'Every model returned for this key has previously failed a live test call.');
      return;
    }

    // Sort: recommended flash-lite/flash first, then alphabetically by display name
    usable.sort((a, b) => {
      const rank = m => (/flash-lite/i.test(m.name) ? 0 : /flash/i.test(m.name) ? 1 : 2);
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return (a.displayName || a.name).localeCompare(b.displayName || b.name);
    });

    state.fetchedModels = usable;
    try { localStorage.setItem('jeeves_fetched_models', JSON.stringify(usable)); } catch(e){}

    const recommended = usable.find(m => /flash/i.test(m.name) && !/pro/i.test(m.name)) || usable[0];

    modelSelect.innerHTML = '';
    usable.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name; // e.g. "models/gemini-3.1-flash-lite"
      const isRecommended = m.name === recommended.name;
      opt.textContent = (m.displayName || m.name) + (isRecommended ? '  ★ Recommended' : '');
      modelSelect.appendChild(opt);
    });
    modelSelect.disabled = false;

    Object.entries(overrideSelects).forEach(([type, sel]) => {
      if (!sel) return;
      const currentOverride = state.modelOverrides[type] || '';
      sel.innerHTML = '<option value="">Use default model</option>';
      usable.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.displayName || m.name;
        sel.appendChild(opt);
      });
      sel.disabled = false;
      sel.value = usable.some(m => m.name === currentOverride) ? currentOverride : '';
    });

    // Selection precedence: previously saved model if still present, else recommended
    const savedStillValid = preferredModel && usable.some(m => m.name === preferredModel);
    modelSelect.value = savedStillValid ? preferredModel : recommended.name;

    if (hiddenCount > 0) {
      hiddenModelsNote.style.display = 'block';
      hiddenModelsNote.innerHTML = `${hiddenCount} model(s) hidden after failing a previous verification. <a href="#" id="reset-blacklist-link">Reset and show them again</a>.`;
      document.getElementById('reset-blacklist-link').addEventListener('click', (e) => {
        e.preventDefault();
        state.blacklist = [];
        persistBlacklist();
        fetchModels(apiKey, preferredModel);
      });
    } else {
      hiddenModelsNote.style.display = 'none';
      hiddenModelsNote.innerHTML = '';
    }

    setStatus('ok', `Found ${usable.length} compatible model${usable.length === 1 ? '' : 's'} (${hiddenCount} hidden as previously unavailable). ${recommended.displayName || shortModelName(recommended.name)} is recommended — but names alone don't confirm access, so "Verify" is still worth a click.`);
    loadPricingFieldsForModel(modelSelect.value);
  }

  function saveSettings(){
    const newKey = apiKeyInput.value.trim();
    const newHonorific = honorificInput.value.trim() || 'Sir';
    const selectedPersonaRadio = document.querySelector('input[name="persona"]:checked');
    const newPersona = selectedPersonaRadio ? selectedPersonaRadio.value : 'reggie';
    const selectedThemeRadio = document.querySelector('input[name="theme"]:checked');
    const newTheme = selectedThemeRadio ? selectedThemeRadio.value : 'light';
    const newModel = modelSelect.value || '';


    if (!newKey) {
      setStatus('error', 'An API key is required before Jeeves may proceed.');
      return;
    }
    if (!newModel) {
      setStatus('error', 'Please select a model — fetch the catalogue first if the list is empty.');
      return;
    }

    state.apiKey = newKey;
    state.persona = newPersona;
    state.honorific = newHonorific;
    state.theme = newTheme;
    state.model = newModel;
    state.ttsRate = parseFloat(document.getElementById('tts-rate-input')?.value) || 1.0;
    localStorage.setItem('jeeves_tts_rate', state.ttsRate);

    state.modelOverrides = {};
    Object.entries(overrideSelects).forEach(([type, sel]) => {
      if (sel && sel.value) state.modelOverrides[type] = sel.value;
    });

    applyTheme(state.theme);

    state.pricing[newModel] = {
      free: freeTierCheck.checked,
      inputPerM: freeTierCheck.checked ? null : (priceInputEl.value.trim() || null),
      outputPerM: freeTierCheck.checked ? null : (priceOutputEl.value.trim() || null),
    };

    localStorage.setItem(LS_KEY_API, state.apiKey);
    localStorage.setItem(LS_KEY_PERSONA, state.persona);
    localStorage.setItem(LS_KEY_HONORIFIC, state.honorific);
    localStorage.setItem(LS_KEY_THEME, state.theme);
    localStorage.setItem(LS_KEY_MODEL, state.model);
    localStorage.setItem(LS_KEY_MODEL_OVERRIDES, JSON.stringify(state.modelOverrides));

    pushUserSettingsToCloud();

    closeModal();
    replayHistory();
  }

  async function verifySelectedModel(){
    const modelName = modelSelect.value;
    const apiKey = apiKeyInput.value.trim();
    if (!modelName || !apiKey) {
      setStatus('error', 'Select a model and ensure a key is entered first.');
      return;
    }
    verifyModelBtn.disabled = true;
    verifyModelBtn.textContent = 'Checking…';
    setStatus('loading', `Sending a minimal test request to ${shortModelName(modelName)}…`);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 1 }
        })
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        const msg = (errBody && errBody.error && errBody.error.message) || `Request failed with status ${resp.status}`;
        throw new Error(msg);
      }
      setStatus('ok', `Confirmed: ${shortModelName(modelName)} responded successfully to a live test call.`);
    } catch (err) {
      const unavailable = /no longer available|not found|does not have access/i.test(err.message);
      if (unavailable && !state.blacklist.includes(modelName)) {
        state.blacklist.push(modelName);
        persistBlacklist();
      }
      setStatus('error', `${shortModelName(modelName)} is not usable with this key: ${err.message}` + (unavailable ? ' It has been hidden from the list — reselect from the remaining options.' : ''));
      if (unavailable) fetchModels(apiKey, state.model);
    } finally {
      verifyModelBtn.disabled = false;
      verifyModelBtn.textContent = 'Verify';
    }
  }

  async function refreshAppCache(){
    if (refreshAppBtn) {
      refreshAppBtn.disabled = true;
      refreshAppBtn.textContent = 'Updating…';
    }
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(key => caches.delete(key)));
      }
    } catch (err) {
      console.warn('Jeeves: Unable to purge all caches', err);
    }
    sessionStorage.setItem('jeeves_just_updated', '1');
    const cleanUrl = window.location.origin + window.location.pathname;
    window.location.replace(`${cleanUrl}?t=${Date.now()}`);
  }


  function clearConversation(){
    state.history = [];
    persistHistory();
    closeModal();
    replayHistory();
  }

  // ---------- Jeeves Reader Engine ----------
  const JeevesReader = {
    storyId: '',
    lines: [],
    currentIndex: 0,
    isPlaying: false,
    _playToken: 0,

    parseLine(raw) {
      const match = raw.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
      if (match) {
        return { speaker: match[1].trim(), text: match[2].trim() };
      }
      return { speaker: 'Jeeves', text: raw.trim() };
    },

    getProfile(speaker) {
      if (!state.voiceProfiles[speaker]) {
        state.voiceProfiles[speaker] = { pitch: 0, rate: 1.0, browserPitch: 1.0 };
        try { localStorage.setItem(LS_KEY_VOICE_PROFILES, JSON.stringify(state.voiceProfiles)); } catch(e){}
        pushVoiceProfilesToCloud();
      }
      return state.voiceProfiles[speaker];
    },

    load(rawText, storyId = 'default_story') {
      this.storyId = storyId;
      this.lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      this.currentIndex = state.readerProgress[this.storyId] || 0;
      if (this.currentIndex >= this.lines.length) this.currentIndex = 0;
    },

    saveProgress() {
      state.readerProgress[this.storyId] = this.currentIndex;
      try { localStorage.setItem(LS_KEY_READER_PROGRESS, JSON.stringify(state.readerProgress)); } catch(e){}
    },

    async play() {
      if (!this.lines.length || this.currentIndex >= this.lines.length) return;
      this.isPlaying = true;
      const myToken = ++this._playToken;

      while (this.isPlaying && this.currentIndex < this.lines.length) {
        const current = this.parseLine(this.lines[this.currentIndex]);
        const profile = this.getProfile(current.speaker);
        const clean = sanitizeForSpeech(current.text);

        // Prefetch up to 3 sentences ahead
        for (let offset = 1; offset <= 3; offset++) {
          const aheadIdx = this.currentIndex + offset;
          if (aheadIdx < this.lines.length) {
            const ahead = this.parseLine(this.lines[aheadIdx]);
            const aheadClean = sanitizeForSpeech(ahead.text);
            const aheadProf = this.getProfile(ahead.speaker);
            const aheadKey = aheadClean ? `${aheadClean}__p${aheadProf.pitch}_r${aheadProf.rate || 1}` : '';
            if (aheadKey && !audioPrefetchCache.has(aheadKey)) {
              audioPrefetchCache.set(aheadKey, fetchTtsBlobUrl(aheadClean, aheadProf.pitch, aheadProf.rate || 1));
            }
          }
        }

        const cleanKey = clean ? `${clean}__p${profile.pitch}_r${profile.rate || 1}` : '';
        if (clean) {
          let playedCloud = false;
          if (getTtsQuota() < 980000) {
            try {
              const audioUrl = audioPrefetchCache.has(cleanKey)
                ? await audioPrefetchCache.get(cleanKey)
                : await fetchTtsBlobUrl(clean, profile.pitch, profile.rate || 1);
              audioPrefetchCache.delete(cleanKey);
              if (audioUrl) {
                await new Promise(resolve => {
                  this._resolveCurrent = resolve;
                  ttsAudio.src = audioUrl;
                  ttsAudio.playbackRate = state.ttsRate || 1.0;
                  ttsAudio.onended = resolve;
                  ttsAudio.onerror = resolve;
                  ttsAudio.play().catch(resolve);
                });
                this._resolveCurrent = null;
                playedCloud = true;
              }
            } catch (err) {
              console.warn('Reader cloud audio failed, falling back:', err);
            }
          }

          if (!playedCloud && 'speechSynthesis' in window) {
            await new Promise(resolve => {
              this._resolveCurrent = resolve;
              const u = new SpeechSynthesisUtterance(clean);
              const voice = getJeevesVoice();
              if (voice) u.voice = voice;
              u.rate = (state.ttsRate || 1.0) * (profile.rate || 1.0);
              u.pitch = profile.browserPitch || 1.0;
              u.onend = () => resolve();
              u.onerror = () => resolve();
              speechSynthesis.speak(u);
            });
            this._resolveCurrent = null;
          }
        }

        if (myToken !== this._playToken) return; // superseded by a pause/seek elsewhere

        this.currentIndex++;
        this.saveProgress();
        updateReaderBar();
      }
      if (myToken === this._playToken) this.isPlaying = false;
    },

    pause() {
      this._playToken++;
      this.isPlaying = false;
      if (this._resolveCurrent) { const r = this._resolveCurrent; this._resolveCurrent = null; r(); }
      ttsAudio.pause();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      this.saveProgress();
      updateReaderBar();
    },

    seekTo(index) {
      const wasPlaying = this.isPlaying;
      this.pause();
      this.currentIndex = Math.max(0, Math.min(index, this.lines.length - 1));
      this.saveProgress();
      updateReaderBar();
      if (wasPlaying) this.play();
    },

    back(n = 1) {
      this.seekTo(this.currentIndex - n);
    }
  };
  window.JeevesReader = JeevesReader;


const ICON_PLAY = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" style="display:block;margin:auto;"><polygon points="6,4 20,12 6,20"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" style="display:block;margin:auto;"><rect x="5" y="4" width="4.5" height="16" rx="1"/><rect x="14.5" y="4" width="4.5" height="16" rx="1"/></svg>';

function buildReaderBar(container) {
  const bar = document.createElement('div');
  bar.className = 'reader-bar';
  bar.innerHTML = `
    <span class="reader-title reader-bar-title"></span>
    <button class="reader-back-btn reader-bar-btn" title="Back a line" type="button">⟲</button>
    <button class="reader-playpause-btn reader-bar-btn" title="Play/Pause" type="button" aria-label="Play or pause">${ICON_PLAY}</button>
    <input type="range" class="reader-slider" min="0" max="0" value="0" step="1">
    <span class="reader-position reader-bar-label"></span>
    <button class="reader-close-btn reader-bar-btn" title="Close" type="button">✕</button>
  `;

  (container || document.body).appendChild(bar);

  bar.querySelector('.reader-back-btn').addEventListener('click', () => {
    JeevesReader.back(1);
  });

  bar.querySelector('.reader-playpause-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (JeevesReader.isPlaying) {
      JeevesReader.pause();
    } else if (JeevesReader.lines.length) {
      unlockAudio();
      JeevesReader.play().then(updateReaderBar);
      updateReaderBar();
    }
  });

  const slider = bar.querySelector('.reader-slider');
  slider.addEventListener('input', () => {
    slider.dataset.dragging = '1';
    const val = parseInt(slider.value, 10);
    document.querySelectorAll('.reader-bar').forEach(b => {
      const label = b.querySelector('.reader-position');
      if (label) label.textContent = `${val + 1} / ${JeevesReader.lines.length}`;
      const s = b.querySelector('.reader-slider');
      if (s && s !== slider) s.value = val;
    });
  });
  slider.addEventListener('change', () => {
    delete slider.dataset.dragging;
    JeevesReader.seekTo(parseInt(slider.value, 10));
  });

  bar.querySelector('.reader-close-btn').addEventListener('click', () => {
    JeevesReader.pause();
    hideReaderBar();
  });

  return bar;
}

function showReaderBar(title) {
  const mountPoints = [
    document.getElementById('composer') || document.body,
    document.querySelector('#jeeves-library-modal .library-player-slot') || document.getElementById('jeeves-library-modal')
  ].filter(Boolean);

  mountPoints.forEach(container => {
    let bar = container.querySelector(':scope > .reader-bar');
    if (!bar) {
      bar = buildReaderBar(container);
    }
    bar.style.display = 'flex';
    const titleEl = bar.querySelector('.reader-title');
    if (titleEl) titleEl.textContent = title;
  });

  updateReaderBar();
}

function hideReaderBar() {
  document.querySelectorAll('.reader-bar').forEach(bar => {
    bar.style.display = 'none';
  });
}

function updateReaderBar() {
  const bars = document.querySelectorAll('.reader-bar');
  if (!bars.length) return;

  const total = JeevesReader.lines.length;
  const idx = Math.min(JeevesReader.currentIndex, Math.max(total - 1, 0));

  bars.forEach(bar => {
    if (bar.style.display === 'none') return;

    const slider = bar.querySelector('.reader-slider');
    if (slider && !slider.dataset.dragging) {
      slider.max = Math.max(total - 1, 0);
      slider.value = idx;
    }
    const label = bar.querySelector('.reader-position');
    if (label) label.textContent = `${Math.min(idx + 1, total)} / ${total}`;

    const ppBtn = bar.querySelector('.reader-playpause-btn');
    if (ppBtn) ppBtn.innerHTML = JeevesReader.isPlaying ? ICON_PAUSE : ICON_PLAY;
  });
}

let unsubscribeSuggestions = null;

function listenForSuggestions() {
  if (!window.db) return;
  if (unsubscribeSuggestions) unsubscribeSuggestions();
  
  unsubscribeSuggestions = window.db.collection('suggestions')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      const suggestions = [];
      snapshot.forEach(doc => suggestions.push({ id: doc.id, ...doc.data() }));
      const isOwner = currentUser && currentUser.email === 'pulsipherd@gmail.com';
      const unresolved = suggestions.filter(s => !s.resolved);
      
      const flag = document.getElementById('settings-flag');
      if (flag) {
        flag.style.display = (isOwner && unresolved.length > 0) ? 'inline-block' : 'none';
      }

      const bannerContainer = document.getElementById('suggestion-banner-container');
      const suggestionLink = document.getElementById('suggestion-link-trigger');
      if (bannerContainer && suggestionLink) {
        if (isOwner && unresolved.length > 0) {
          const honorific = state.honorific || 'Sir';
          suggestionLink.textContent = `Would you like to implement one of the feature suggestions, ${honorific}?`;
          bannerContainer.style.display = 'inline-block';
          suggestionLink.onclick = (e) => {
            e.preventDefault();
            openModal();
            setTimeout(() => {
              const stepV = document.getElementById('settings-step-v');
              if (stepV) {
                stepV.scrollIntoView({ behavior: 'smooth', block: 'center' });
                stepV.style.transition = 'background-color 0.5s';
                stepV.style.backgroundColor = 'rgba(139, 0, 0, 0.08)';
                setTimeout(() => { stepV.style.backgroundColor = ''; }, 1500);
              }
            }, 100);
          };
        } else {
          bannerContainer.style.display = 'none';
        }
      }
      
      const listEl = document.getElementById('admin-suggestions-list');
      if (listEl) {
        if (suggestions.length === 0) {
          listEl.innerHTML = '<p style="font-size:12px; color:var(--mist); text-align:center; margin:8px 0;">No suggestions received yet.</p>';
          return;
        }
        const sorted = [...suggestions].sort((a, b) => {
          if (!!a.resolved !== !!b.resolved) return a.resolved ? 1 : -1;
          const orderA = (typeof a.order === 'number' && !isNaN(a.order)) ? a.order : Infinity;
          const orderB = (typeof b.order === 'number' && !isNaN(b.order)) ? b.order : Infinity;
          if (orderA !== orderB) return orderA - orderB;
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
        listEl.innerHTML = sorted.map(s => {
          const votes = s.votes || 0;
          if (isOwner) {
            return `
              <div style="padding:6px 8px; border-bottom:1px solid var(--hairline); display:flex; gap:8px; align-items:center; font-size:12px;${s.resolved ? ' opacity: 0.55;' : ''}">
                <div style="display:flex; flex-direction:column; align-items:center; flex-shrink:0;">
                  <span style="font-size:10px; color:var(--brass-bright); font-weight:600; line-height:1; margin-bottom:2px;">+${votes}</span>
                  <input type="number" min="1" step="1" placeholder="#" value="${(typeof s.order === 'number' && !isNaN(s.order)) ? s.order : ''}" onchange="updateSuggestionOrder('${s.id}', this.value)" style="width:38px; height:24px; text-align:center; font-size:11px; padding:2px; background:var(--ink-panel-2); color:var(--parchment); border:1px solid var(--hairline); border-radius:4px;">
                </div>
                <div style="flex:1;">
                  <strong style="${s.resolved ? 'text-decoration: line-through;' : ''}">${escapeHtml(s.authorName || 'Anonymous')}</strong>: <span style="${s.resolved ? 'text-decoration: line-through;' : ''}">${escapeHtml(s.text)}</span>
                  <div style="font-size:10px; color:var(--mist);">${new Date(s.createdAt).toLocaleString()}</div>
                </div>
                <button type="button" onclick="toggleSuggestionResolved('${s.id}', ${!s.resolved})" style="font-size:11px; padding:2px 6px; flex-shrink:0;">${s.resolved ? 'Reopen' : 'Resolve'}</button>
              </div>
            `;
          } else {
            return `
              <div style="padding:6px 8px; border-bottom:1px solid var(--hairline); display:flex; gap:8px; align-items:center; font-size:12px;${s.resolved ? ' opacity: 0.55;' : ''}">
                <button type="button" onclick="upvoteSuggestion('${s.id}')" title="Vote for this suggestion" style="padding:4px 8px; font-size:11px; background:var(--ink-panel-2); color:var(--parchment); border:1px solid var(--hairline); border-radius:4px; flex-shrink:0; cursor:pointer; display:flex; flex-direction:column; align-items:center; min-width:38px;">
                  <span style="font-weight:bold; color:var(--brass-bright);">+1</span>
                  <span style="font-size:10px; color:var(--mist);">${votes}</span>
                </button>
                <div style="flex:1;">
                  <strong style="${s.resolved ? 'text-decoration: line-through;' : ''}">${escapeHtml(s.authorName || 'Anonymous')}</strong>: <span style="${s.resolved ? 'text-decoration: line-through;' : ''}">${escapeHtml(s.text)}</span>
                  <div style="font-size:10px; color:var(--mist);">${new Date(s.createdAt).toLocaleString()}</div>
                </div>
                ${s.resolved ? '<span style="font-size:11px; color:var(--mist); font-style:italic;">Resolved</span>' : ''}
              </div>
            `;
          }
        }).join('');
      }
    }, err => console.warn('Suggestions listener error:', err));
}

window.upvoteSuggestion = async function(id) {
  if (!window.db || typeof firebase === 'undefined') return;
  try {
    await window.db.collection('suggestions').doc(id).update({
      votes: firebase.firestore.FieldValue.increment(1)
    });
  } catch(e) { console.error('Failed to upvote suggestion:', e); }
};

window.updateSuggestionOrder = async function(id, orderVal) {
  if (!window.db) return;
  const num = orderVal === '' ? null : Number(orderVal);
  try {
    await window.db.collection('suggestions').doc(id).update({
      order: (num !== null && !isNaN(num)) ? num : null
    });
  } catch(e) { console.error('Failed to update suggestion order:', e); }
};

window.toggleSuggestionResolved = async function(id, resolved) {
  if (!window.db) return;
  try {
    await window.db.collection('suggestions').doc(id).update({ resolved });
  } catch(e) { console.error('Failed to update suggestion:', e); }
};

async function submitUserSuggestion() {
  const input = document.getElementById('suggestion-input');
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  input.value = '';
  
  try {
    await window.db.collection('suggestions').add({
      text,
      authorEmail: currentUser ? currentUser.email : 'guest',
      authorName: currentUser ? (currentUser.displayName || currentUser.email) : 'Visitor',
      createdAt: Date.now(),
      resolved: false,
      votes: 0
    });
    alert('Thank you! Your suggestion has been recorded.');
  } catch(e) {
      console.error('Detailed suggestion submission error:', e);
      alert('Unable to submit suggestion at this moment: ' + (e.message || e));
  }
}

async function syncConvoToCloud(convo) {
  if (!isAuthenticated || !window.db || !window.auth?.currentUser || !convo) return;
  try {
    await window.db
      .collection('users')
      .doc(window.auth.currentUser.uid)
      .collection('conversations')
      .doc(convo.id)
      .set({
        title: convo.title || 'Main Conversation',
        history: convo.history || [],
        updatedAt: convo.updatedAt || Date.now()
      }, { merge: true });
  } catch (e) {
    console.error(`Cloud sync failed, ${state.honorific}:`, e);
  }
}

  function persistHistory(){
    const idx = state.conversations.findIndex(c => c.id === state.activeId);
    if (idx !== -1) {
      state.conversations[idx].history = state.history;
      state.conversations[idx].updatedAt = Date.now();
      try { localStorage.setItem(LS_KEY_CONVERSATIONS, JSON.stringify(state.conversations)); } catch(e){}
    }
    try { localStorage.setItem(LS_KEY_ACTIVE, state.activeId); } catch(e){}

    if (isAuthenticated && window.db && window.auth?.currentUser) {
      clearTimeout(cloudSyncTimer);
      cloudSyncTimer = setTimeout(() => {
        const activeConvo = state.conversations.find(c => c.id === state.activeId);
        if (activeConvo) syncConvoToCloud(activeConvo);
      }, 1500);
    }
  }

  function autoResizeInput(){
    if (!inputEl) return;
    const maxHeight = Math.round(window.innerHeight * 0.45);
    inputEl.style.height = 'auto';
    const newHeight = Math.min(inputEl.scrollHeight, maxHeight);
    inputEl.style.height = newHeight + 'px';
    inputEl.style.overflowY = inputEl.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  const WODEHOUSE_THINKING_PHRASES = [
    "Jeeves is engaging the old cerebellum",
    "Jeeves is feeding the intellect on a bit of fish",
    "Jeeves' massive brain is in motion",
    "Jeeves' old lemon is functioning smoothly",
    "Ripples of thought are stirring the grey matter",
    "Jeeves is allowing the cerebellum to simmer gently",
    "Jeeves is bringing the giant intellect to bear upon the problem",
    "Jeeves' mental machinery is ticking over",
    "Jeeves is consulting the vast mental encyclopaedia"
  ];
  let thinkingInterval = null;

  function startThinkingAnimation() {
    stopThinkingAnimation();
    const el = document.getElementById('jeeves-thinking');
    if (!el) return;
    const phrase = WODEHOUSE_THINKING_PHRASES[Math.floor(Math.random() * WODEHOUSE_THINKING_PHRASES.length)];
    let dots = '';
    el.textContent = phrase + dots;
    thinkingInterval = setInterval(() => {
      dots += '.';
      el.textContent = phrase + dots;
    }, 1000);
  }

  function stopThinkingAnimation() {
    if (thinkingInterval) {
      clearInterval(thinkingInterval);
      thinkingInterval = null;
    }
    const el = document.getElementById('jeeves-thinking');
    if (el) el.textContent = '';
  }

  async function sendMessage(){
    stopListening();
    const text = inputEl.value.trim();
    if (!text && pendingAttachments.length === 0) return;

    if (pendingSpokenReferences && /^(yes|yeah|sure|yep|please|yes please|certainly|indeed|i would|tell me|read them)\b/i.test(text.replace(/[.,!?]/g, '').trim())) {
      const refsToRead = pendingSpokenReferences;
      pendingSpokenReferences = null;
      inputEl.value = '';
      autoResizeInput();
      addUserMessage(text);
      state.history.push({ role: 'user', parts: [{ text }] });
      const ackText = `Certainly, ${state.honorific}. Reading the references now.`;
      const { row, bubble } = messageRow('model');
      bubble.innerHTML = `<span style="font-family:var(--font-display); font-size:17.5px; color:var(--parchment);">${ackText}</span>`;
      if (chatEl) chatEl.appendChild(row);
      scrollToBottom();
      state.history.push({ role: 'model', parts: [{ text: ackText }], model: getModelForConvoType(state.convoType), timestamp: Date.now() });
      persistHistory();
      if (isAutoSpeakEnabled) {
        stopSpeech();
        const refLines = refsToRead.split(/\n+/).map(l => l.trim()).filter(l => l && !/^#{1,4}\s*references/i.test(l));
        refLines.forEach(line => speak(line));
        speak(`Is there anything else I may assist you with, ${state.honorific}?`);
      }
      return;
    }
    pendingSpokenReferences = null;

    if (!state.apiKey || !state.model) {
      openModal();
      setStatus('error', 'Jeeves requires an API key and a selected model before he may be of assistance.');
      return;
    }

    if (chatEl && chatEl.querySelector('.empty-state')) clearChatDom();

    const currentAttachments = [...pendingAttachments];
    clearPendingImages();

    inputEl.value = '';
    autoResizeInput();
    sendBtn.disabled = true;

    const userParts = [];
    currentAttachments.forEach(att => {
      if (att.type === 'image') {
        userParts.push({ inlineData: { mimeType: att.mimeType, data: att.base64Data } });
      } else {
        userParts.push({ text: `File attached (${att.fileName}):\n\`\`\`\n${att.textContent}\n\`\`\`` });
      }
    });
    if (text) userParts.push({ text });


    state.history.push({ role: 'user', parts: userParts });
    persistHistory();
    addUserMessage(text, currentAttachments.find(a => a.type === 'image')?.dataUrl);

    const usedModel = getModelForConvoType(state.convoType);
    const { bubble: modelBubble, phrase: stallPhrase } = addModelMessagePlaceholder();
    if (isAutoSpeakEnabled) {
      stopSpeech();
      speak(stallPhrase);
    }
    startThinkingAnimation();

    const contextMessages = state.history.slice(-MAX_TURNS_SENT).map(t => ({ role: t.role, parts: t.parts }));

    try {
          // Waking the voice for mobile browsers
      const wakeUp = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(wakeUp);
      unlockAudio();
      const now = new Date().toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
    });

    const systemInstruction = buildSystemInstruction();
    const voiceConvoAddendum = isAutoSpeakEnabled
      ? ` You are currently in a spoken, hands-free conversation — the person is likely driving or otherwise occupied and cannot type or read. Keep this in mind: favor shorter, more conversational sentences over dense written prose, and never ask them to "see below," "click a link," or "read the references," since they cannot look at the screen right now. End your response with one brief, natural, inviting follow-up question so the conversation can continue turn by turn without them needing to touch the screen — the same instinct you already apply when offering to read out the references. Keep this question genuinely relevant to what was just discussed, not generic or tacked on, and ask only one.`
      : '';
    const fullSystemInstruction = `Current date and time: ${now}. ${systemInstruction}${voiceConvoAddendum}; The date and time are already correct and already reflects your local time zone — never use Google Search to look up or double-check the date or time, and never substitute UTC or any other time zone for it. ${systemInstruction}`;

      if (!systemInstruction) throw new Error("System instruction is empty.");
      
      const url = `https://generativelanguage.googleapis.com/v1beta/${usedModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(state.apiKey)}`;
      const temperature = state.convoType === 'research' ? 0.3 : (state.convoType === 'coding' ? 0.4 : 0.85);
      const body = {
        contents: contextMessages,
        systemInstruction: { parts: [{ text: fullSystemInstruction }] },
        generationConfig: { temperature: temperature }
      };

      body.tools = [{ googleSearch: {} }];

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!resp.ok || !resp.body) {
        const errBody = await resp.json().catch(() => ({}));
        const msg = (errBody && errBody.error && errBody.error.message) || `Request failed with status ${resp.status}`;
        throw new Error(msg);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      
      let fullText = '';
      let lastSpoken = '';
      let firstChunk = true;
      let usageMetadata = null;
      let searchGroundingChunks = [];
      let searchGroundingSupports = [];
      let speechIndex = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          let payload;
          try { payload = JSON.parse(jsonStr); } catch(e){ continue; }
          if (payload.usageMetadata) usageMetadata = payload.usageMetadata;

          const candidate = payload.candidates && payload.candidates[0];
          if (!candidate) continue;

          if (candidate.groundingMetadata) {
            // console.log('Jeeves: groundingMetadata received —', {
            //   chunkCount: (candidate.groundingMetadata.groundingChunks || []).length,
            //   supportCount: (candidate.groundingMetadata.groundingSupports || []).length,
            //   raw: candidate.groundingMetadata
            // });
            if (candidate.groundingMetadata.groundingChunks) searchGroundingChunks = candidate.groundingMetadata.groundingChunks;
            if (candidate.groundingMetadata.groundingSupports) searchGroundingSupports = candidate.groundingMetadata.groundingSupports;
          }

          const parts = (candidate.content && candidate.content.parts) || [];
          const chunkText = parts.filter(p => !p.thought).map(p => p.text || '').join('');
          if (chunkText) {
            fullText += chunkText;
            if (firstChunk) {
              stopThinkingAnimation();
              modelBubble.innerHTML = '';
              firstChunk = false;
            }
            renderMarkdownInto(modelBubble, fullText);

            if (isAutoSpeakEnabled) {
              const refMatch = fullText.match(/(?:^|\n)\s*(?:#{1,4}|\*\*)\s*(?:references|sources|citations)\b/i);
              const limit = refMatch ? refMatch.index : fullText.length;
              let unspoken = fullText.slice(speechIndex, limit);
              let match;
              while ((match = unspoken.match(/^[\s\S]*?(?<!\b(?:Mr|Mrs|Ms|Dr|Prof|Rev|etc|e\.g|i\.e))[.!?](?=\s|$)/))) {
                const sentence = match[0].trim();
                speechIndex += match[0].length;
                if (sentence) speak(sentence);
                unspoken = fullText.slice(speechIndex, limit);
              }
            }
          }
        }
      }

      let storyToRead = null;
      const storyMarker = fullText.match(/\[\[READ_STORY:\s*([^\]]+?)\s*\]\]/);
      if (storyMarker) {
        storyToRead = storyMarker[1];
        fullText = fullText.replace(/\s*\[\[READ_STORY:[^\]]*\]\]/g, '').trim();
        renderMarkdownInto(modelBubble, fullText);
      }

      // Grounding chunks contain the REAL, verified URIs Google Search found —
      // unlike anything the model might type in prose, these are guaranteed live.
      if (searchGroundingChunks.length) {
        fullText = applyGroundingFootnotes(fullText, searchGroundingChunks, searchGroundingSupports);
        renderMarkdownInto(modelBubble, fullText);
      }

      if (isAutoSpeakEnabled) {
        const refMatch = fullText.match(/(?:^|\n)\s*(?:#{1,4}|\*\*)\s*(?:references|sources|citations)\b/i);
        if (refMatch) {
          if (speechIndex < refMatch.index) {
            const trailing = fullText.slice(speechIndex, refMatch.index).trim();
            if (trailing) speak(trailing);
            speechIndex = refMatch.index;
          }
          pendingSpokenReferences = fullText.slice(refMatch.index).trim();
          speak(`Would you like the references for this information, ${state.honorific}, or is there anything else I can help you with?`);
        } else if (speechIndex < fullText.length) {
          const remaining = fullText.slice(speechIndex).trim();
          if (remaining) speak(remaining);
        }
      }

      // Auto-close any unbalanced code fence before it's rendered or saved,
      // so a truncated/cut-off response can never poison future turns.
      const fenceCount = (fullText.match(/```/g) || []).length;
      if (fenceCount % 2 !== 0) {
        fullText += '\n```';
      }

      if (!fullText) {
        console.error("Jeeves: Stream finished but fullText is empty.");
        fullText = "I'm terribly sorry, Sir, but my train of thought appears to have been derailed. Might we try that again?";
        renderMarkdownInto(modelBubble, fullText);
      }

      if (usageMetadata) {
        state.usageLog.push({ timestamp: Date.now(), input: usageMetadata.promptTokenCount, output: usageMetadata.candidatesTokenCount });
        localStorage.setItem(LS_KEY_USAGE, JSON.stringify(state.usageLog));
        updateUsageDashboard();
      }

      const historyEntry = { role: 'model', parts: [{ text: fullText }], model: usedModel, timestamp: Date.now() };
      if (usageMetadata) historyEntry.usage = usageMetadata;
      state.history.push(historyEntry);
      persistHistory();

      if (usageMetadata) {
        const meta = buildMetaLine(usageMetadata, usedModel, historyEntry.timestamp);
        if (meta) modelBubble.appendChild(meta);
      }

      if (storyToRead) startStoryFromChat(storyToRead);

    } catch (err) {
      const errDiv = document.createElement('div');
      errDiv.style.color = '#942735';
      errDiv.style.marginTop = '10px';
      errDiv.style.paddingTop = '10px';
      errDiv.style.borderTop = '1px solid var(--claret)';
      errDiv.textContent = 'A regrettable difficulty has arisen: ' + err.message;
      modelBubble.appendChild(errDiv);
      
      const unavailable = /no longer available|not found|does not have access/i.test(err.message);


      if (unavailable) {
        if (!state.blacklist.includes(usedModel)) {
          state.blacklist.push(usedModel);
          persistBlacklist();
        }
        // remove the unsent user turn's pairing note isn't needed; offer a switch instead
        const alt = (state.fetchedModels || []).find(m => m.name !== usedModel && !state.blacklist.includes(m.name));
        if (alt) {
          const switchBtn = document.createElement('button');
          switchBtn.className = 'copy-btn';
          switchBtn.type = 'button';
          switchBtn.textContent = `Switch to ${shortModelName(alt.name)} and retry`;
          switchBtn.addEventListener('click', () => {
            state.model = alt.name;
            localStorage.setItem(LS_KEY_MODEL, state.model);
            inputEl.value = text;
            autoResizeInput();
            state.history.pop(); // remove the user turn we're about to resend
            persistHistory();
            const row = modelBubble.closest('.msg-row');
            if (row) row.remove();
            const userRows = chatEl.querySelectorAll('.msg-row.user');
            const lastUserRow = userRows[userRows.length - 1];
            if (lastUserRow) lastUserRow.remove();
            sendMessage();
          });
          modelBubble.appendChild(switchBtn);
        } else {
          const note = document.createElement('div');
          note.style.fontFamily = 'var(--font-ui)';
          note.style.fontSize = '12px';
          note.style.color = 'var(--mist)';
          note.textContent = 'This model has been hidden from future lists. Open Settings to choose another.';
          modelBubble.appendChild(note);
        }
      }
      if (!unavailable) {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'copy-btn';
        retryBtn.type = 'button';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', () => {
          inputEl.value = text;
          autoResizeInput();
          state.history.pop(); // drop the unanswered user turn
          persistHistory();
          const row = modelBubble.closest('.msg-row');
          if (row) row.remove();
          const userRows = chatEl.querySelectorAll('.msg-row.user');
          const lastUserRow = userRows[userRows.length - 1];
          if (lastUserRow) lastUserRow.remove();
          sendMessage();
        });
        modelBubble.appendChild(retryBtn);
      }
    } finally {
      stopThinkingAnimation();
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

    // ---------- Speech Recognition ----------
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isRecognitionActive = false;
  let isAutoRestart = false;

  let baseText = '';
  let committedTranscript = '';
  let liveInterim = '';

  function startListening() {
    if (!recognition) return;
    try {
      baseText = inputEl.value ? (inputEl.value.trim() + ' ') : '';
      committedTranscript = '';
      liveInterim = '';
      isRecognitionActive = true;
      isAutoRestart = false;
      recognition.start();
    } catch (e) {
      /* Recognition may already be running */
    }
  }

  function stopListening() {
    isRecognitionActive = false;
    baseText = '';
    committedTranscript = '';
    liveInterim = '';
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    if (micBtn) micBtn.classList.remove('listening');
  }

  if (SpeechRecognition && micBtn) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    micBtn.addEventListener('click', () => {
      if (micBtn.classList.contains('listening')) {
        stopListening();
      } else {
        unlockAudio();
        toggleAutoSpeak(true);
        startListening();
      }
    });

    recognition.onstart = () => {
      micBtn.classList.add('listening');
      if (!isAutoRestart) playListeningChime();
      isAutoRestart = false;
    };

    recognition.onend = () => {
      if (isRecognitionActive) {
        if (liveInterim) {
          committedTranscript += liveInterim + ' ';
          liveInterim = '';
        }
        isAutoRestart = true;
        try { recognition.start(); } catch (e) {
          micBtn.classList.remove('listening');
        }
      } else {
        micBtn.classList.remove('listening');
      }
    };

        const TRIGGER_REGEX = /\b(?:what do you think|your thoughts|over to you|take it away|if you please|if you would|thank you),?\s*(?:jeeves|chiefs?|geeves|jeevs|jeans|teams|Jesus|sheaves)s?[\s.,!?]*$/i;

    recognition.onresult = (event) => {
      liveInterim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          committedTranscript += transcript + ' ';
        } else {
          liveInterim = transcript;
        }
      }
      let combined = (baseText + committedTranscript + ' ' + liveInterim).replace(/\s+/g, ' ');

      // Check for stop command
      if (/\b(stop listening|that will be all |thank you jeeves|you may retire)\b/i.test(combined)) {
        stopListening();
        return;
      }

      if (TRIGGER_REGEX.test(combined)) {

        combined = combined.replace(TRIGGER_REGEX, '').trim();
        inputEl.value = combined;
        autoResizeInput();
        stopListening();
        sendMessage();
        return;
      }

      inputEl.value = combined;
      autoResizeInput();
    };

  } else if (micBtn) {
    micBtn.style.display = 'none';
  }

  // ---------- Conversation switcher & Library ----------
  const archiveOverlay = document.getElementById('archive-overlay');
  const archiveContent = document.getElementById('archive-content');
  const closeArchivesBtn = document.getElementById('close-archives');

  function ensureArchiveTabs() {
    let tabNav = document.getElementById('archive-tab-nav');
    if (!tabNav && archiveOverlay) {
      tabNav = document.createElement('div');
      tabNav.id = 'archive-tab-nav';
      tabNav.className = 'archive-tab-nav';

      tabNav.innerHTML = `
        <button type="button" class="archive-tab-btn ${state.activeArchiveTab === 'archives' ? 'active' : ''}" data-tab="archives">Conversations</button>
        <button type="button" class="archive-tab-btn ${state.activeArchiveTab === 'library' ? 'active' : ''}" data-tab="library">Story Library</button>
      `;

      if (archiveContent && archiveContent.parentElement) {
        archiveContent.parentElement.insertBefore(tabNav, archiveContent);
      }

      tabNav.querySelectorAll('.archive-tab-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          state.activeArchiveTab = e.currentTarget.dataset.tab;
          tabNav.querySelectorAll('.archive-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === state.activeArchiveTab);
          });
          if (state.activeArchiveTab === 'library') {
            if (isAuthenticated) await pullCloudStories();
            renderLibrary();
          } else {
            renderArchives();
          }
        });
      });
    } else if (tabNav) {
      tabNav.querySelectorAll('.archive-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === state.activeArchiveTab);
      });
    }
  }

  async function preloadStoryText(story) {
    if (!story) return '';
    const override = state.storyOverrides && state.storyOverrides[story.id];
    if (override) {
      state.storyTextCache.set(story.id, override);
      return override;
    }
    if (story.rawLit) {
      state.storyTextCache.set(story.id, story.rawLit);
      return story.rawLit;
    }
    if (state.storyTextCache.has(story.id)) return state.storyTextCache.get(story.id);
    return '';
  }

  async function parseStoryToLit(rawText, title) {
    const model = getModelForConvoType('general');
    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
    const prompt = `Convert the following public domain P.G. Wodehouse story excerpt into proprietary line-by-line format where every single sentence or sentence clause is prefixed with [Speaker Name].
Rules:
1. Retain ALL original prose without omitting or summarizing any text.
2. Tag narrator prose as [Bertie] (or the appropriate narrator).
3. Tag spoken dialogue with the character speaking (e.g. [Jeeves], [Aunt Agatha], [Bingo]).
4. Each entry must be on a new line: [Speaker] Text.
5. Never let one line mix quoted dialogue with its narrative attribution tag (e.g. "said Jeeves with a sniff"). Split such sentences into two consecutive lines: the quoted words tagged to the speaking character, and the "said/replied/muttered ..." attribution tagged to the narrator.
   Example — wrong: [Jeeves] "Very good, sir," said Jeeves with a sniff.
   Example — right:
   [Jeeves] "Very good, sir,"
   [Bertie] said Jeeves with a sniff.

Story Excerpt:
${rawText}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Parsing error ${resp.status}`);
    }
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  async function reviewLitLines(lines) {
    const model = getModelForConvoType('general');
    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
    const numbered = lines.map((l, i) => `${i + 1}. [${l.speaker}] ${l.text}`).join('\n');
    const prompt = `You are proofreading a script converted from a P.G. Wodehouse story into "[Speaker] Text" lines. Bertie is the narrator: narration and dialogue attribution tags (e.g. "said Jeeves with a sniff") belong to [Bertie], while quoted speech belongs to the character speaking.
Find lines whose speaker is probably wrong: attribution tags stuck onto a character's dialogue, quoted speech tagged to the narrator when it clearly belongs to someone else, narration tagged to a character, two speakers' words merged into one line, or the wrong character credited.
Return ONLY a JSON array of objects like {"line": 12, "reason": "short explanation"}. Include only genuinely suspicious lines, at most 30. Return [] if there are none.

Script:
${numbered}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Review error ${resp.status}`);
    }
    const data = await resp.json();
    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || '[]').replace(/```json|```/g, '').trim();
    const flags = JSON.parse(raw);
    return Array.isArray(flags) ? flags : [];
  }
    async function findLinesForCharacter(lines, name) {
    const model = getModelForConvoType('general');
    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
    const numbered = lines.map((l, i) => `${i + 1}. [${l.speaker}] ${l.text}`).join('\n');
    const prompt = `Below is a script converted from a P.G. Wodehouse story into "[Speaker] Text" lines. Bertie is the narrator. A new character, "${name}", has just been added, but some of her or his spoken dialogue is probably still tagged to another speaker.
Find every line of quoted speech that is actually spoken by ${name} but is currently tagged to a different speaker. Do NOT include narration or attribution tags (like "said ${name}"), which stay with the narrator, and do not include lines already tagged [${name}].
Return ONLY a JSON array of objects like {"line": 12, "reason": "short explanation"}. Return [] if there are none.

Script:
${numbered}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Scan error ${resp.status}`);
    }
    const data = await resp.json();
    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || '[]').replace(/```json|```/g, '').trim();
    const found = JSON.parse(raw);
    return Array.isArray(found) ? found : [];
  }
  function downloadLitFile(title, text) {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const safeName = (title || 'story').replace(/[^a-z0-9\-_ ]+/gi, '').trim().replace(/\s+/g, '_') || 'story';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.lit`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openStoryReviewModal(title, initialLit, onSave, knownCharacters) {
    let modal = document.getElementById('review-story-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'review-story-modal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    const lines = initialLit.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const parsedLines = lines.map(line => {
      const match = line.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
      return match ? { speaker: match[1].trim(), text: match[2].trim() } : { speaker: 'Bertie', text: line };
    });

    const speakers = Array.from(new Set([...(knownCharacters || []), ...parsedLines.map(p => p.speaker), 'Bertie', 'Jeeves']));

    modal.innerHTML = `
      <div class="modal" style="max-width: 680px; height: 85vh; display:flex; flex-direction:column;">
        <div class="modal-header">
          <h2>Review Script: ${escapeHtml(title)}</h2>
          <button class="icon-btn" id="close-review-modal" aria-label="Close">✕</button>
        </div>
        <div class="modal-body" style="flex:1; overflow-y:auto; padding-right:6px;">
          <p class="field-help" style="margin-bottom:12px;">Verify and refine the character assignments before saving to your library.</p>
          <div style="display:flex; gap:6px; margin-bottom:12px;">
            <input type="text" id="new-character-input" placeholder="Add a character (e.g. Florence)" style="flex:1; font-size:12px; padding:6px 8px; background:var(--ink-panel-2); color:var(--parchment); border:1px solid var(--hairline); border-radius:6px;">
            <button class="btn-secondary" id="add-character-btn" type="button" style="padding:6px 12px; font-size:12px;">+ Add</button>
            <button class="btn-secondary" id="ai-review-btn" type="button" style="padding:6px 12px; font-size:12px;">🔍 AI Review</button>
          </div>
          <div id="ai-review-status" class="field-help" style="margin-bottom:8px;"></div>
          
          <div id="review-lines-container" style="display:flex; flex-direction:column; gap:8px;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="cancel-review-btn" type="button">Cancel</button>
          <button class="btn-primary" id="save-reviewed-story-btn" type="button">Save to Library</button>
        </div>
      </div>
    `;

    function fitTextarea(t) {
      t.style.height = 'auto';
      t.style.height = t.scrollHeight + 'px';
    }

    function buildReviewRow(speaker, text) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; align-items:flex-start; background:var(--ink-deep);padding:8px; border-radius:8px; border:1px solid var(--hairline);';

      const select = document.createElement('select');
      select.style.cssText = 'width:125px; flex-shrink:0; font-size:12px; padding:6px; background:var(--ink-panel-2); color:var(--parchment); border:1px solid var(--hairline); border-radius:6px;';
      speakers.forEach(spk => {
        const opt = document.createElement('option');
        opt.value = spk;
        opt.textContent = spk;
        if (spk.toLowerCase() === speaker.toLowerCase()) opt.selected = true;
        select.appendChild(opt);
      });

      const input = document.createElement('textarea');
      input.rows = 1;
      input.value = text;
      input.style.cssText = 'flex:1; font-size:13px; padding:6px 8px; background:var(--ink-panel-2); color:var(--parchment); border:1px solid var(--hairline); border-radius:6px; resize:none; overflow:hidden; font-family:var(--font-ui);';
      input.oninput = () => fitTextarea(input);

      const btnStyle = 'flex-shrink:0; width:26px; background:transparent; border:1px solid var(--hairline); color:var(--parchment); border-radius:6px; cursor:pointer; font-size:12px;';

      const splitBtn = document.createElement('button');
      splitBtn.type = 'button';
      splitBtn.textContent = '✂';
      splitBtn.title = 'Split at cursor — carve off a misattributed narrator tag';
      splitBtn.style.cssText = btnStyle;
      splitBtn.onclick = () => {
        const pos = input.selectionStart;
        const before = input.value.slice(0, pos).trim();
        const after = input.value.slice(pos).trim();
        if (!before || !after) return;
        input.value = before;
        const newRow = buildReviewRow('Bertie', after);
        row.after(newRow);
        fitTextarea(input);
        fitTextarea(newRow.querySelector('textarea'));
      };

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '✕';
      delBtn.title = 'Delete this line';
      delBtn.style.cssText = btnStyle;
      delBtn.onclick = () => row.remove();

      row.appendChild(select);
      row.appendChild(input);
      row.appendChild(splitBtn);
      row.appendChild(delBtn);
      return row;
    }

    const container = modal.querySelector('#review-lines-container');
    parsedLines.forEach(item => container.appendChild(buildReviewRow(item.speaker, item.text)));

    function addCharacterOption(name) {
      name = (name || '').trim();
      if (!name || speakers.some(s => s.toLowerCase() === name.toLowerCase())) return null;
      speakers.push(name);
      if (!state.voiceProfiles[name]) {
        state.voiceProfiles[name] = { pitch: 0, rate: 1.0, browserPitch: 1.0 };
        localStorage.setItem(LS_KEY_VOICE_PROFILES, JSON.stringify(state.voiceProfiles));
        pushVoiceProfilesToCloud();
      }
      container.querySelectorAll('select').forEach(sel => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      });
      return name;
    }

    async function reassignToCharacter(name) {
      const status = modal.querySelector('#ai-review-status');
      const rows = Array.from(container.children);
      const current = rows.map(r => ({ speaker: r.querySelector('select').value, text: r.querySelector('textarea').value.trim() }));
      status.textContent = `Scanning for ${name}'s lines…`;
      try {
        const found = await findLinesForCharacter(current, name);
        let first = null, count = 0;
        found.forEach(f => {
          const row = rows[Number(f.line) - 1];
          if (!row) return;
          const select = row.querySelector('select');
          const oldSpeaker = select.value;
          if (oldSpeaker === name) return;
          select.value = name;
          row.style.borderColor = '#e0b45a';
          row.querySelector('.flag-note')?.remove();
          const note = document.createElement('div');
          note.className = 'flag-note';
          note.style.cssText = 'flex-basis:100%; font-size:11px; color:#e0b45a;';
          note.textContent = `↪ Moved from ${oldSpeaker} to ${name} — ${f.reason || 'check this line'}`;
          row.appendChild(note);
          first = first || row;
          count++;
        });
        status.textContent = count ? `${count} line(s) reassigned to ${name} — check the highlighted rows.` : `No lines found for ${name}.`;
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        status.textContent = 'Scan failed: ' + err.message;
      }
    }

    modal.querySelector('#add-character-btn').onclick = async () => {
      const input = modal.querySelector('#new-character-input');
      const added = addCharacterOption(input.value);
      input.value = '';
      input.focus();
      if (added && confirm(`Scan the script for lines that belong to ${added}?`)) await reassignToCharacter(added);
    };
    modal.querySelector('#new-character-input').onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); modal.querySelector('#add-character-btn').click(); }
    };

        modal.querySelector('#ai-review-btn').onclick = async () => {
      const btn = modal.querySelector('#ai-review-btn');
      const status = modal.querySelector('#ai-review-status');
      const rows = Array.from(container.children);
      rows.forEach(r => { r.style.borderColor = 'var(--hairline)'; r.querySelector('.flag-note')?.remove(); });
      const current = rows.map(r => ({ speaker: r.querySelector('select').value, text: r.querySelector('textarea').value.trim() }));
      btn.disabled = true;
      status.textContent = 'Reviewing…';
      try {
        const flags = await reviewLitLines(current);
        let first = null, count = 0;
        flags.forEach(f => {
          const row = rows[Number(f.line) - 1];
          if (!row) return;
          row.style.borderColor = '#e0b45a';
          const note = document.createElement('div');
          note.className = 'flag-note';
          note.style.cssText = 'flex-basis:100%; font-size:11px; color:#e0b45a;';
          note.textContent = '⚠ ' + (f.reason || 'Check this line');
          row.appendChild(note);
          first = first || row;
          count++;
        });
        status.textContent = count ? `${count} line(s) flagged — check the highlighted rows.` : 'No problems found.';
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {
        status.textContent = 'Review failed: ' + err.message;
      }
      btn.disabled = false;
    };
    modal.querySelector('#close-review-modal').onclick = () => modal.classList.remove('open');
    modal.querySelector('#cancel-review-btn').onclick = () => modal.classList.remove('open');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('open'); };

    modal.querySelector('#save-reviewed-story-btn').onclick = () => {
      const rows = container.children;
      const resultLines = [];
      for (let r of rows) {
        const spk = r.querySelector('select').value;
        const txt = r.querySelector('textarea').value.trim();
        if (txt) resultLines.push(`[${spk}] ${txt}`);
      }
      modal.classList.remove('open');
      onSave(resultLines.join('\n'), speakers);
    };

    modal.classList.add('open');
    container.querySelectorAll('textarea').forEach(fitTextarea);
  }

  function openVoiceSettingsModal() {
    let modal = document.getElementById('voice-settings-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'voice-settings-modal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    const names = Object.keys(state.voiceProfiles).sort((a, b) => {
      if (a === 'Jeeves') return -1;
      if (b === 'Jeeves') return 1;
      return a.localeCompare(b);
    });

    const rowsHtml = names.map(name => {
      const p = state.voiceProfiles[name];
      const pitch = typeof p.pitch === 'number' ? p.pitch : 0;
      const rate = typeof p.rate === 'number' ? p.rate : 1.0;
      return `
        <div class="voice-row" data-name="${escapeHtml(name)}">
          <div class="voice-row-header">
            <strong>${escapeHtml(name)}</strong>
            <button type="button" class="test-voice-btn archive-btn">▶ Test</button>
          </div>
          <label class="voice-slider-row">
            Pitch
            <input type="range" class="pitch-slider" min="-20" max="20" step="0.5" value="${pitch}">
            <span class="pitch-val voice-val">${pitch}</span>
          </label>
          <label class="voice-slider-row">
            Rate
            <input type="range" class="rate-slider" min="0.5" max="2.0" step="0.05" value="${rate}">
            <span class="rate-val voice-val">${rate.toFixed(2)}</span>
          </label>
        </div>
      `;
    }).join('');

    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Character Voices</h2>
          <button class="icon-btn" id="close-voice-modal" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <p class="voice-modal-intro">Pitch and rate are applied on top of Jeeves' own voice, so every character is still recognizably read by him. Bigger jumps sound less natural — small nudges usually work best.</p>
          <div id="voice-rows">${rowsHtml}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="cancel-voice-modal" type="button">Cancel</button>
          <button class="btn-primary" id="save-voice-modal" type="button">Save Voices</button>
        </div>
      </div>
    `;

    modal.querySelectorAll('.voice-row').forEach(row => {
      const pitchSlider = row.querySelector('.pitch-slider');
      const rateSlider = row.querySelector('.rate-slider');
      const pitchVal = row.querySelector('.pitch-val');
      const rateVal = row.querySelector('.rate-val');

      pitchSlider.addEventListener('input', () => { pitchVal.textContent = pitchSlider.value; });
      rateSlider.addEventListener('input', () => { rateVal.textContent = parseFloat(rateSlider.value).toFixed(2); });

      row.querySelector('.test-voice-btn').addEventListener('click', async (e) => {
        unlockAudio();
        const btn = e.currentTarget;
        const name = row.dataset.name;
        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = '…';
        const sample = name === 'Jeeves'
          ? 'Very good, sir. I shall attend to it directly.'
          : `Good heavens, this is how ${name} shall sound.`;
        try {
          const url = await fetchTtsBlobUrl(sample, parseFloat(pitchSlider.value), parseFloat(rateSlider.value));
          if (url) {
            await new Promise(resolve => {
              ttsAudio.src = url;
              ttsAudio.playbackRate = state.ttsRate || 1.0;
              ttsAudio.onended = resolve;
              ttsAudio.onerror = resolve;
              ttsAudio.play().catch(resolve);
            });
          }
        } catch (err) {
          console.warn('Voice test failed:', err);
        } finally {
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      });
    });

    modal.querySelector('#close-voice-modal').onclick = () => modal.classList.remove('open');
    modal.querySelector('#cancel-voice-modal').onclick = () => modal.classList.remove('open');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('open'); };

    modal.querySelector('#save-voice-modal').onclick = () => {
      modal.querySelectorAll('.voice-row').forEach(row => {
        const name = row.dataset.name;
        const pitch = parseFloat(row.querySelector('.pitch-slider').value);
        const rate = parseFloat(row.querySelector('.rate-slider').value);
        state.voiceProfiles[name] = {
          ...state.voiceProfiles[name],
          pitch,
          rate
        };
      });
      try { localStorage.setItem(LS_KEY_VOICE_PROFILES, JSON.stringify(state.voiceProfiles)); } catch(e){}
      pushVoiceProfilesToCloud();
      modal.classList.remove('open');
    };

    modal.classList.add('open');
  }

  function openAddStoryModal() {
    let modal = document.getElementById('story-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'story-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal" style="max-width: 580px;">
          <div class="modal-header">
            <h2>Add Story to Library</h2>
            <button class="icon-btn" id="close-story-modal" aria-label="Close">✕</button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label for="story-title-input">Story Title</label>
              <input type="text" id="story-title-input" placeholder="e.g. The Inimitable Jeeves - Chapter 1">
            </div>
            <div class="field">
              <label for="story-file-upload">Upload Text File (.txt / .lit)</label>
              <input type="file" id="story-file-upload" accept=".txt,.lit" style="margin-bottom:8px;">
            </div>
            <div class="field" style="margin-bottom:0;">
              <label for="story-text-input">Or Paste Story Prose</label>
              <textarea id="story-text-input" rows="8" style="width:100%; background:var(--ink-deep); border:1px solid var(--hairline); color:var(--parchment); border-radius:8px; padding:10px; font-family:var(--font-ui); font-size:13px; resize:vertical;" placeholder="Paste original story text here..."></textarea>
            </div>
            <div id="story-parse-status" style="margin-top:10px; font-size:12px; color:var(--brass-bright); font-style:italic;"></div>
          </div>
          <div class="modal-footer">
            <button class="btn-primary" id="save-story-btn" type="button">Parse & Add to Library</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#close-story-modal').onclick = () => modal.classList.remove('open');
      modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('open'); };

      modal.querySelector('#story-file-upload').onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            modal.querySelector('#story-text-input').value = evt.target.result;
            if (!modal.querySelector('#story-title-input').value) {
              modal.querySelector('#story-title-input').value = file.name.replace(/\.[^/.]+$/, '');
            }
          };
          reader.readAsText(file);
        }
      };

      modal.querySelector('#save-story-btn').onclick = async () => {
        const title = modal.querySelector('#story-title-input').value.trim();
        const raw = modal.querySelector('#story-text-input').value.trim();
        const statusEl = modal.querySelector('#story-parse-status');
        const saveBtn = modal.querySelector('#save-story-btn');

        if (!title || !raw) {
          alert('Please provide both a title and story text, Sir.');
          return;
        }

        saveBtn.disabled = true;
        statusEl.textContent = 'Jeeves is organizing the dialogue and narrative prose…';

        try {
          let litContent = raw;
          // If not already in .lit format, parse via Gemini
          if (!/^\s*\[[^\]]+\]/m.test(raw)) {
            litContent = await parseStoryToLit(raw, title);
          }

          const storyObj = {
            id: 'custom-' + Date.now(),
            title: title,
            rawLit: litContent
          };

          state.customStories.push(storyObj);
          localStorage.setItem(LS_KEY_CUSTOM_STORIES, JSON.stringify(state.customStories));
          pushStoryToCloud(storyObj.id, storyObj.title, storyObj.rawLit, true);
          modal.classList.remove('open');
          modal.querySelector('#story-title-input').value = '';
          modal.querySelector('#story-text-input').value = '';
          statusEl.textContent = '';
          renderLibrary();
        } catch (err) {
          console.error(err);
          alert('A difficulty occurred during parsing: ' + err.message);
          statusEl.textContent = '';
        } finally {
          saveBtn.disabled = false;
        }
      };
    }
    modal.classList.add('open');
  }

  function orderedCatalogue() {
    const full = [...state.storyCatalogue, ...state.customStories];
    const byDefault = [...full].sort((a, b) => {
      const aBuiltIn = state.storyCatalogue.some(s => s.id === a.id);
      const bBuiltIn = state.storyCatalogue.some(s => s.id === b.id);
      if (aBuiltIn !== bBuiltIn) return aBuiltIn ? -1 : 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    if (!state.libraryOrder.length) return byDefault;
    const known = state.libraryOrder.filter(id => byDefault.some(s => s.id === id));
    const unknown = byDefault.filter(s => !known.includes(s.id));
    return [...known.map(id => byDefault.find(s => s.id === id)), ...unknown];
  }

  let dragState = null; // { card, grid, pointerId }

  function wireDragHandle(handle, card, grid) {
    if (!handle) return;
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragState = { card, grid, pointerId: e.pointerId };
      card.classList.add('dragging');
    });
  }

  document.addEventListener('pointermove', (e) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const { card, grid } = dragState;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const targetCard = under && under.closest('.story-book-card');
    if (targetCard && targetCard !== card && targetCard.parentElement === grid) {
      const rect = targetCard.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      grid.insertBefore(card, before ? targetCard : targetCard.nextSibling);
    }
  });

  function endDrag(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const { card, grid } = dragState;
    card.classList.remove('dragging');
    state.libraryOrder = [...grid.children].map(c => c.dataset.id);
    try { localStorage.setItem(LS_KEY_LIBRARY_ORDER, JSON.stringify(state.libraryOrder)); } catch(e){}
    dragState = null;
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  function wireDragHandle(handle, card, grid) {
    if (!handle) return;
    handle.draggable = true;
    handle.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
    handle.addEventListener('click', (e) => { e.stopPropagation(); });
  }

  function wireGridDropZone(grid) {
    grid.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = grid.querySelector('.story-book-card.dragging');
      if (!dragging) return;
      const targetCard = e.target.closest('.story-book-card');
      if (targetCard && targetCard !== dragging && targetCard.parentElement === grid) {
        const rect = targetCard.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        grid.insertBefore(dragging, before ? targetCard : targetCard.nextSibling);
      }
    });
    grid.addEventListener('drop', (e) => {
      e.preventDefault();
      state.libraryOrder = [...grid.children].map(c => c.dataset.id);
      try { localStorage.setItem(LS_KEY_LIBRARY_ORDER, JSON.stringify(state.libraryOrder)); } catch(err) {}
    });
  }

  function renderLibrary() {
    ensureArchiveTabs();
    if (!archiveContent) return;
    archiveContent.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.className = 'archive-panel-toolbar';
    toolbar.innerHTML = `
      <input type="text" id="search-stories" placeholder="Search stories…" aria-label="Search stories">
      <button id="voice-settings-btn" class="archive-btn" type="button" title="Character Voices" style="padding:7px 12px;">🎙</button>
      <button id="add-story-btn" class="archive-btn" type="button" title="Add Story" style="padding:7px 12px;">＋</button>
    `;
    archiveContent.appendChild(toolbar);

    toolbar.querySelector('#voice-settings-btn')?.addEventListener('click', openVoiceSettingsModal);
    toolbar.querySelector('#add-story-btn')?.addEventListener('click', openAddStoryModal);

    const grid = document.createElement('div');
    grid.className = 'story-book-grid';
    wireGridDropZone(grid);

    const fullCatalogue = orderedCatalogue();

    fullCatalogue.forEach(story => {
      preloadStoryText(story);
      const card = document.createElement('div');
      card.className = 'story-book-card';
      card.dataset.id = story.id;

      const progressIdx = state.readerProgress[story.id] || 0;
      let pct = 0;
      if (state.storyTextCache.has(story.id)) {
        const lines = state.storyTextCache.get(story.id).split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length > 0) {
          pct = Math.min(100, Math.round((progressIdx / lines.length) * 100));
        }
      }

      const bookmarkText = progressIdx > 0 ? `Bookmark: ${pct}%` : 'Bookmark: 0%';
      const isCurrent = JeevesReader.storyId === story.id && JeevesReader.isPlaying;
      const btnLabel = isCurrent ? '⏸ Pause' : (progressIdx > 0 ? '▶ Resume' : '▶ Play');
      const isCustom = state.customStories.some(s => s.id === story.id);
      const iconBtnStyle = 'flex:1; background:transparent; border:1px solid rgba(212,175,55,0.45); color:#e9dfc8; border-radius:6px; padding:4px 2px; font-size:10.5px; cursor:pointer; line-height:1.3;';

      card.innerHTML = `
        <div class="story-drag-handle" title="Drag to reorder">⠿</div>
        <div class="story-book-title">${escapeHtml(story.title)}</div>
        <div>
          <div class="story-book-meta">${bookmarkText}</div>
          <button class="archive-btn open-btn read-story-btn" type="button" style="width:100%; font-size:12px; padding:6px 6px;">
            ${btnLabel}
          </button>
          <div style="display:flex; gap:4px; margin-top:6px;">
            <button class="edit-story-btn" type="button" title="Edit Script" style="${iconBtnStyle}">✎ Edit</button>
            ${isCustom ? `<button class="download-story-btn" type="button" title="Download .lit" style="${iconBtnStyle}">⬇</button>` : ''}
            ${isCustom ? `<button class="delete-story-btn" type="button" title="Remove from Library" style="${iconBtnStyle}">🗑</button>` : ''}
          </div>
        </div>
      `;

      wireDragHandle(card.querySelector('.story-drag-handle'), card, grid);

      const playBtn = card.querySelector('.read-story-btn');
      playBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        unlockAudio();
        if (JeevesReader.storyId === story.id && JeevesReader.isPlaying) {
          JeevesReader.pause();
          renderLibrary();
        } else {
          const text = await preloadStoryText(story);
          if (!text) {
            alert(`Unable to load "${story.title}"`);
            return;
          }
          JeevesReader.load(text, story.id);
          showReaderBar(story.title);
          const playPromise = JeevesReader.play();
          renderLibrary();
          await playPromise;
          renderLibrary();
        }
      });

      card.querySelector('.edit-story-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const currentText = await preloadStoryText(story);
        openStoryReviewModal(story.title, currentText || '', (finalLit, speakers) => {
          if (isCustom) {
            const target = state.customStories.find(s => s.id === story.id);
            if (target) target.rawLit = finalLit;
            localStorage.setItem(LS_KEY_CUSTOM_STORIES, JSON.stringify(state.customStories));
          } else {
            state.storyOverrides[story.id] = finalLit;
            localStorage.setItem(LS_KEY_STORY_OVERRIDES, JSON.stringify(state.storyOverrides));
          }
          state.storyCharacters[story.id] = speakers;
          localStorage.setItem(LS_KEY_STORY_CHARACTERS, JSON.stringify(state.storyCharacters));
          state.storyTextCache.set(story.id, finalLit);
          pushStoryToCloud(story.id, story.title, finalLit, false);
          renderLibrary();
        }, state.storyCharacters[story.id]);
      });

      card.querySelector('.download-story-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const text = await preloadStoryText(story);
        downloadLitFile(story.title, text);
      });

      card.querySelector('.delete-story-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm(`Remove "${story.title}" from your library, Sir?`)) return;
        state.customStories = state.customStories.filter(s => s.id !== story.id);
        localStorage.setItem(LS_KEY_CUSTOM_STORIES, JSON.stringify(state.customStories));
        state.storyTextCache.delete(story.id);
        if (JeevesReader.storyId === story.id) {
          JeevesReader.pause();
          hideReaderBar();
        }
        renderLibrary();
      });

      card.addEventListener('click', () => {
        playBtn.click();
      });

      grid.appendChild(card);
    });

    archiveContent.appendChild(grid);

    toolbar.querySelector('#search-stories')?.addEventListener('input', async (e) => {
      const term = e.target.value.toLowerCase();
      const cards = Array.from(grid.querySelectorAll('.story-book-card'));
      for (const cardEl of cards) {
        const story = fullCatalogue.find(s => s.id === cardEl.dataset.id);
        const text = await preloadStoryText(story);
        const match = !term || (story?.title || '').toLowerCase().includes(term) || (text || '').toLowerCase().includes(term);
        cardEl.style.display = match ? 'flex' : 'none';
      }
    });

    archiveOverlay.classList.add('open');
  }

    async function startNewChat(){
    if (state.history.length > 0 && state.activeId !== 'default') {
      const convo = state.conversations.find(c => c.id === state.activeId);
      if (convo && convo.title === 'New Conversation') {
        convo.title = await generateTitle(state.history);
        convo.updatedAt = Date.now();
        syncConvoToCloud(convo);
      }
    }
    const id = Date.now().toString();
    state.conversations.push({ id, title: 'New Conversation', history: [], updatedAt: Date.now() });
    state.activeId = id;
    state.history = [];
    persistHistory();
    replayHistory();
    archiveOverlay?.classList.remove('open');
  }

  function renameConversation(id, newTitle){
    const convo = state.conversations.find(c => c.id === id);
    if (convo && newTitle.trim()) {
      convo.title = newTitle.trim();
      convo.updatedAt = Date.now();
      try { localStorage.setItem(LS_KEY_CONVERSATIONS, JSON.stringify(state.conversations)); } catch(e){}
      syncConvoToCloud(convo);
    }
  }

  function switchToConversation(id){
    const convo = state.conversations.find(c => c.id === id);
    if (!convo) return;
    state.activeId = id;
    state.history = convo.history || [];
    persistHistory();
    replayHistory();
    archiveOverlay.classList.remove('open');
  }

  function renderArchives(){
    ensureArchiveTabs();
    archiveContent.innerHTML = '';

    // Dedicated toolbar for Conversations
    const toolbar = document.createElement('div');
    toolbar.className = 'archive-panel-toolbar';
    toolbar.innerHTML = `
      <input type="text" id="search-archives" placeholder="Search conversations…" aria-label="Search conversations">
      <button id="refine-titles-btn" class="archive-btn" type="button" title="Tidy up conversation titles" style="padding:7px 12px;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="18" height="18">
          <!-- Dustpan -->
          <path d="M47,49 C47,44.6 44.4,41 41.2,41 L38.8,41 C35.6,41 33,44.6 33,49 L33,56 L25,56 C23.3,56 22,57.3 22,59 L22,76 C22,77.7 23.3,79 25,79 L53,79 C54.7,79 56,77.7 56,76 L56,59 C56,57.3 54.7,56 53,56 L47,56 Z M37,20 C37,17.8 38.3,16 40,16 C41.7,16 43,17.8 43,20 L43,41 L37,41 Z M41,25 C41,24.4 39.5,24 39,24 C38.5,24 39,24.4 39,25 L39,29 C39,29.6 39.5,30 40,30 C40.5,30 41,29.6 41,29 Z" fill="#8c642d"/>
          <path d="M25,72 L53,72 L51,62 L27,62 Z" fill="#ffffff"/>
          <!-- Broom -->
          <rect x="67" y="14" width="4" height="35" rx="2" fill="#8c642d"/>
          <path d="M69,45 C65.5,45 61,48.5 61,52 L77,52 C77,48.5 72.5,45 69,45 Z" fill="#8c642d"/>
          <path d="M60,54 L78,54 C78.5,54 79,54.5 79,55 L79,59 C79,59.5 78.5,60 78,60 L60,60 C59.5,60 59,59.5 59,59 L59,55 C59,54.5 59.5,54 60,54 Z" fill="#8c642d"/>
          <path d="M59,62 L51,79 C51,79 53,79 55,79 L60,67 L63,79 L66,67 L69,79 L72,67 L75,79 L77,79 L79,62 Z" fill="#8c642d"/>
        </svg>
      </button>
      <button id="archive-new-chat-btn" class="archive-btn" type="button" title="Start new conversation" style="padding:7px 12px;">＋</button>
    `;
    archiveContent.appendChild(toolbar);

    toolbar.querySelector('#refine-titles-btn')?.addEventListener('click', refineAllTitles);
    toolbar.querySelector('#archive-new-chat-btn')?.addEventListener('click', startNewChat);

    const listContainer = document.createElement('div');
    listContainer.className = 'archive-list';
    listContainer.id = 'archive-convo-list';
    archiveContent.appendChild(listContainer);

    [...state.conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).forEach(c => {
      const row = document.createElement('div');
      row.className = 'archive-row';
      row.dataset.id = c.id;
      const stamp = c.updatedAt ? new Date(c.updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'No date recorded';
      row.innerHTML = `
        <div class="archive-title-wrap">
          <input type="text" class="archive-input" value="${escapeHtml(c.title)}" aria-label="Conversation title">
          <div class="archive-timestamp">${escapeHtml(stamp)}</div>
        </div>
        <button tabindex="0" class="archive-btn delete-btn tooltip-btn" data-tooltip="Delete conversation" type="button" aria-label="Delete conversation" style="background:var(--claret); color:white; margin-left:4px;">✕</button>
        <button tabindex="0" class="archive-btn open-btn tooltip-btn" data-tooltip="Open conversation" type="button" aria-label="${c.id === state.activeId ? 'Current conversation' : 'Open conversation'}">${c.id === state.activeId ? 'Current' : 'Open'}</button>
      `;

      row.querySelector('.archive-input').addEventListener('blur', (e) => renameConversation(c.id, e.target.value));
      row.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Are you sure you wish to discard this conversation?')) {
          const targetId = c.id;
          state.conversations = state.conversations.filter(convo => convo.id !== targetId);
          try { localStorage.setItem(LS_KEY_CONVERSATIONS, JSON.stringify(state.conversations)); } catch(e){}
          if (isAuthenticated && window.db && window.auth?.currentUser) {
            window.db.collection('users').doc(window.auth.currentUser.uid).collection('conversations').doc(targetId).delete().catch(console.error);
          }
          if (state.activeId === targetId) startNewChat();
          else persistHistory();
          renderArchives();
        }
      });
      row.querySelector('.open-btn').addEventListener('click', () => switchToConversation(c.id));
      listContainer.appendChild(row);
    });

    toolbar.querySelector('#search-archives')?.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      const rows = Array.from(listContainer.querySelectorAll('.archive-row'));
      if (!term) {
        rows.forEach(r => { r.style.display = 'flex'; r.querySelector('.archive-timestamp').style.display = 'block'; });
        return;
      }
      const results = rows.map(row => {
        const convo = state.conversations.find(c => c.id === row.dataset.id);
        let plainText = "";
        convo.history.forEach(turn => turn.parts.forEach(p => { 
          if(p.text && !p.text.includes('Current date and time:') && !p.text.includes('You are Reginald Jeeves')) {
            plainText += p.text.replace(/```[\s\S]*?```/g, ' ') + " "; 
          }
        }));

        const matches = [...plainText.toLowerCase().matchAll(new RegExp(term, 'g'))];
        return { row, plainText, count: matches.length, convo };
      }).filter(r => r.count > 0);

      results.sort((a, b) => b.count - a.count || b.convo.updatedAt - a.convo.updatedAt);
      
      results.forEach(({row, plainText}, i) => {
        row.style.order = i;
        row.style.display = 'flex';
        const ts = row.querySelector('.archive-timestamp');
        const words = plainText.split(/\s+/);
        const snippets = [];
        words.forEach((w, idx) => {
          if (w.toLowerCase().includes(term) && snippets.length < 3) {
            const start = Math.max(0, idx - 5);
            const end = Math.min(words.length, idx + 6);
            snippets.push('...' + words.slice(start, end).join(' ').replace(new RegExp(term, 'gi'), (m) => `<strong>${m}</strong>`) + '...');
          }
        });
        ts.innerHTML = snippets.join('<br>');
      });
      rows.filter(r => !results.find(res => res.row === r)).forEach(r => r.style.display = 'none');
    });

    archiveOverlay.classList.add('open');
    toolbar.querySelector('#search-archives')?.focus();
  }

  document.getElementById('new-chat-btn')?.addEventListener('click', startNewChat);
  document.getElementById('archive-btn')?.addEventListener('click', async () => {
    if (isAuthenticated && window.db && window.auth?.currentUser) {
      await Promise.all([pullCloudArchives(), pullCloudStories()]);
    }
    if (state.activeArchiveTab === 'library') {
      renderLibrary();
    } else {
      renderArchives();
    }
  });

  function closeArchives(){
    archiveOverlay?.classList.remove('open');
    document.getElementById('archive-btn')?.focus();
  }

  closeArchivesBtn?.addEventListener('click', closeArchives);
  archiveOverlay?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeArchives();
    }
  });

  document.getElementById('refine-titles-btn')?.addEventListener('click', refineAllTitles);
  document.getElementById('archive-new-chat-btn')?.addEventListener('click', startNewChat);
  
  // ---------- Event wiring ----------

  document.getElementById('auth-btn')?.addEventListener('click', () => {
    if (isAuthenticated) {
      signOutUser();
    } else {
      signInWithGoogle();
    }
  });
  settingsBtn?.addEventListener('click', openModal);
  closeModalBtn?.addEventListener('click', closeModal);
  modalOverlay?.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  saveSettingsBtn?.addEventListener('click', saveSettings);
  clearHistoryBtn?.addEventListener('click', clearConversation);
  refreshAppBtn?.addEventListener('click', refreshAppCache);

  toggleKeyBtn?.addEventListener('click', () => {
    const isPw = apiKeyInput?.type === 'password';
    if (apiKeyInput) apiKeyInput.type = isPw ? 'text' : 'password';
    toggleKeyBtn.textContent = isPw ? 'Hide' : 'Show';
  });

  verifyModelBtn?.addEventListener('click', verifySelectedModel);

  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', (e) => applyTheme(e.target.value));
  });

  const testVoiceBtn = document.getElementById('test-voice-btn');
  testVoiceBtn?.addEventListener('click', () => {
    unlockAudio();
    const currentRate = parseFloat(document.getElementById('tts-rate-input')?.value) || state.ttsRate || 1.0;
    state.ttsRate = currentRate;
    stopSpeech();
    speak(`At your service, ${state.honorific}. The vocal faculties appear in pristine working order.`);
  });

  const rateSlider = document.getElementById('tts-rate-slider');
  const rateInput = document.getElementById('tts-rate-input');
  const rateVal = document.getElementById('tts-rate-val');
  if (rateSlider && rateInput && rateVal) {
    rateSlider.addEventListener('input', (e) => {
      rateInput.value = e.target.value;
      rateVal.textContent = Number(e.target.value).toFixed(2);
    });
    rateInput.addEventListener('input', (e) => {
      rateSlider.value = e.target.value;
      rateVal.textContent = Number(e.target.value || 1.0).toFixed(2);
    });
  }

  modelSelect?.addEventListener('change', () => {
    loadPricingFieldsForModel(modelSelect.value);
  });

  freeTierCheck?.addEventListener('change', () => {
    if (pricingInputsWrap) pricingInputsWrap.style.display = freeTierCheck.checked ? 'none' : 'flex';
    updateSessionTotalNote();
  });
  priceInputEl?.addEventListener('input', () => {
    if (modelSelect?.value) {
      state.pricing[modelSelect.value] = state.pricing[modelSelect.value] || {};
      state.pricing[modelSelect.value].inputPerM = priceInputEl.value;
      state.pricing[modelSelect.value].free = false;
    }
    updateSessionTotalNote();
  });
  priceOutputEl?.addEventListener('input', () => {
    if (modelSelect?.value) {
      state.pricing[modelSelect.value] = state.pricing[modelSelect.value] || {};
      state.pricing[modelSelect.value].outputPerM = priceOutputEl.value;
      state.pricing[modelSelect.value].free = false;
    }
    updateSessionTotalNote();
  });

  document.getElementById('convo-type')?.addEventListener('change', (e) => {
    state.convoType = e.target.value;
  });

  let fetchDebounce;
  apiKeyInput?.addEventListener('input', () => {
    clearTimeout(fetchDebounce);
    const val = apiKeyInput.value.trim();
    if (!val) {
      if (modelSelect) {
        modelSelect.disabled = true;
        modelSelect.innerHTML = '<option value="">Enter a valid API key to fetch available models…</option>';
      }
      setStatus('', '');
      return;
    }
    fetchDebounce = setTimeout(() => fetchModels(val, state.model), 600);
  });

  sendBtn?.addEventListener('click', sendMessage);
  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  inputEl?.addEventListener('input', autoResizeInput);
  autoResizeInput();

  // ---------- Init ----------
  replayHistory();
  updateComposerHint();
  if (sessionStorage.getItem('jeeves_just_updated')) {
    sessionStorage.removeItem('jeeves_just_updated');
    addSystemNote('Application cache successfully purged and latest files loaded.');
  }
  if (!state.apiKey) {
    setTimeout(openModal, 300);
  }
})();