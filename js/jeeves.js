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
  }

  // Configure highlight.js immediately

  hljs.configure({ ignoreUnescapedHTML: true });

  // ---------- Config / storage ----------

  const LS_KEY_API = 'jeeves_api_key';
  const LS_KEY_HONORIFIC = 'jeeves_honorific';
  const LS_KEY_THEME = 'jeeves_theme';
  const LS_KEY_MODEL = 'jeeves_model';
  const LS_KEY_MODEL_OVERRIDES = 'jeeves_model_overrides'; // { [convoType]: modelName }


  const LS_KEY_HISTORY = 'jeeves_history';
  const LS_KEY_BLACKLIST = 'jeeves_unavailable_models';
  const LS_KEY_PRICING = 'jeeves_pricing'; // { [modelName]: { inputPerM, outputPerM, free } }
  const LS_KEY_USAGE = 'jeeves_usage_log';
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
    honorific: localStorage.getItem(LS_KEY_HONORIFIC) || 'Sir',
    theme: localStorage.getItem(LS_KEY_THEME) || 'light',
    model: localStorage.getItem(LS_KEY_MODEL) || '',
    modelOverrides: JSON.parse(localStorage.getItem(LS_KEY_MODEL_OVERRIDES) || '{}'),
    convoType: 'general',


    history: [],
    conversations: [],
    activeId: localStorage.getItem(LS_KEY_ACTIVE) || 'default',
    fetchedModels: [],
    blacklist: [],
    pricing: {},
    usageLog: JSON.parse(localStorage.getItem(LS_KEY_USAGE)) || [],
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
      console.error(`Authentication difficulty, {state.honorific}:`, err);
      if (err.code === 'auth/unauthorized-domain') {
        alert(`Authentication failed: This domain is not authorized in the Firebase Console. Please add "{window.location.hostname}" under Firebase -> Authentication -> Settings -> Authorized Domains.`);
      } else if (err.code !== 'auth/popup-closed-by-user') {
        alert(`Authentication error ({err.code}): {err.message}`);
      }
    });
  }


  function signOutUser() {
    if (!window.auth) return;
    if (unsubscribeCloudSync) {
      unsubscribeCloudSync();
      unsubscribeCloudSync = null;
    }
    window.auth.signOut();
  }

  if (typeof firebase !== 'undefined') {
    window.auth.onAuthStateChanged((user) => {
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


      if (user) {
        initCloudSync(user.uid);
      } else {
        if (unsubscribeCloudSync) {
          unsubscribeCloudSync();
          unsubscribeCloudSync = null;
        }
      }
    });
  }


    let unsubscribeCloudSync = null;

  function initCloudSync(uid) {
    if (!window.db) return;
    if (unsubscribeCloudSync) unsubscribeCloudSync();

    unsubscribeCloudSync = window.db
      .collection('users')
      .doc(uid)
      .collection('conversations')
      .onSnapshot((snapshot) => {
        const cloudConvos = [];
        snapshot.forEach(doc => {
          cloudConvos.push({ id: doc.id, ...doc.data() });
        });

        if (cloudConvos.length > 0) {
          state.conversations = cloudConvos;
          const activeExists = state.conversations.some(c => c.id === state.activeId);
          if (!activeExists) {
            state.activeId = state.conversations[0].id;
          }
          const activeConvo = state.conversations.find(c => c.id === state.activeId);
          const incomingHistory = activeConvo ? (activeConvo.history || []) : [];
          
          const historyChanged = incomingHistory.length !== state.history.length ||
            (incomingHistory.length > 0 && 
             JSON.stringify(incomingHistory[incomingHistory.length - 1].parts) !== 
             JSON.stringify(state.history[state.history.length - 1]?.parts));

          if (historyChanged) {
            state.history = incomingHistory;
            replayHistory();
          }
          if (archiveOverlay?.classList.contains('open')) {
            renderArchives();
          }
        }
      }, (err) => {
        console.error(`Real-time sync difficulty, ${state.honorific}:`, err);
      });
  }

  let pendingAttachments = [];




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
    state.conversations = state.conversations.filter(c => c.history.length > 0 || c.id === 'default');
    const unnamed = state.conversations.filter(c => c.title === 'New Conversation' && c.history.length > 0);
    for (const convo of unnamed) {
      convo.title = await generateTitle(convo.history);
    }
    persistHistory();
    renderArchives();
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
  function persistPricing(){
    localStorage.setItem(LS_KEY_PRICING, JSON.stringify(state.pricing));
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

  let isAutoSpeakEnabled = false;

  function toggleAutoSpeak(forcedState, shouldReadLatest = false) {
    isAutoSpeakEnabled = (typeof forcedState === 'boolean') ? forcedState : !isAutoSpeakEnabled;

    if (muteBtn) {
      muteBtn.classList.toggle('active', isAutoSpeakEnabled);
      muteBtn.setAttribute('data-tooltip', isAutoSpeakEnabled ? 'Voice output: On' : 'Voice output: Off');
      muteBtn.title = isAutoSpeakEnabled ? 'Voice output: On' : 'Voice output: Off';
    }

    if (!isAutoSpeakEnabled) {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    } else if (shouldReadLatest) {
      // Read the most recent model response only when explicitly requested
      const lastModelTurn = [...state.history].reverse().find(t => t.role === 'model');
      if (lastModelTurn) {
        const textPart = (lastModelTurn.parts || []).find(p => p.text);
        if (textPart && textPart.text) {
          const speechText = textPart.text.replace(/```[\s\S]*?```/g, ` Please inspect the code block on screen, ${state.honorific}. `);
          speak(speechText);
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
      return /^#*\s*references\b/i.test(txt) || /^references\b/i.test(el.querySelector('strong')?.textContent?.trim() || '');
    });

    refHeaders.forEach(headerEl => {
      let next = headerEl.nextElementSibling;
      let refEntries = [];
      const nodesToRemove = [];

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
          const cleanEntry = entryHtml.replace(/^\[?\d+\]?\.?\s*/, '');
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

      if (lang === 'copy' || lang === 'draft' || lang === 'quote') {
        const wrap = document.createElement('div');
        wrap.className = 'prose-copy-wrap';
        wrap.textContent = codeEl.textContent.trim();

        const copyBtn = document.createElement('button');
        copyBtn.className = 'corner-copy-btn';
        copyBtn.type = 'button';
        copyBtn.title = 'Copy note';
        copyBtn.setAttribute('aria-label', 'Copy note');
        
        const copyIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        const checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        copyBtn.innerHTML = copyIcon;

        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(wrap.textContent.trim()).then(() => {
            copyBtn.innerHTML = checkIcon;
            setTimeout(() => { copyBtn.innerHTML = copyIcon; }, 1600);
          });
        });

        wrap.appendChild(copyBtn);
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
    'ehow.com'
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

    // Fallback: If no references section was produced, generate one adhering to the credibility template
    const refLines = keptChunks.map((chunk, i) => {
      const web = chunk.web || {};
      const title = (web.title || 'Authoritative Source').replace(/[\[\]]/g, '');
      const uri = web.uri || '#';
      return `${i + 1}. According to ${title}, a verified source identified via search grounding, [${title}](${uri})`;
    });

    return `${text.trimEnd()}\n\n### References\n${refLines.join('\n')}`;
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
  
  function getJeevesVoice() {
    const voices = speechSynthesis.getVoices();
    return voices.find(v => v.lang.startsWith('en-GB') && v.name.includes('Google')) 
    || voices.find(v => v.lang.startsWith('en-GB'))
    || voices.find(v => v.name.includes('Daniel'))
    || voices[0];
  }
  
  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    
    // Remove markdown asterisks and hash symbols for a cleaner reading
    const cleanText = text.replace(/(\*\*|__|\*|_|#)/g, '');
    
    const u = new SpeechSynthesisUtterance(cleanText);
    const voice = getJeevesVoice();
    if (voice) u.voice = voice;
    
    u.rate = 1.0;
    u.pitch = 0.9;
    speechSynthesis.speak(u);
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
    return { row, bubble };
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
    let instructions = `You are Reginald Jeeves, an impeccably erudite and unflappable gentleman's gentleman in the tradition of P.G. Wodehouse. You address the person you serve as "{h}". Your purpose is to be a genuinely useful, accurate, and efficient personal assistant. Your persona is a matter of tone and manner: keep responses concise, accurate, and structured. Whenever you quote from great literature or notable historical figures, always wrap the quotation itself (without your own quotation marks) together with its author in this exact format: [&ldquo;the exact quoted text&rdquo;](https://www.google.com/search?q=%22the%20exact%20quoted%20text%22%20Author%20Name%20quote) &mdash; *Author Name*. Do not add your own quotation marks or a separate reference note around it. Whenever you cite a source inline, use ONLY a bare numeric marker in square brackets immediately after the relevant text (e.g. <sup style="color:var(--brass-bright);"><a href="#ref-m214-1" class="footnote-ref" data-ref="1">1</a></sup>) — NEVER format an inline marker as a markdown link such as <sup style="color:var(--brass-bright);"><a href="#ref-m214-1" class="footnote-ref" data-ref="1">1</a></sup>; real URLs belong only in the References list, not on the inline marker itself. If a single claim draws on more than one source, combine every number into one bracket group separated by commas, like <sup style="color:var(--brass-bright);"><a href="#ref-m214-1" class="footnote-ref" data-ref="1">1</a>, <a href="#ref-m214-2" class="footnote-ref" data-ref="2">2</a>, <a href="#ref-m214-4" class="footnote-ref" data-ref="4">4</a></sup> — never write separate adjacent groups such as <sup style="color:var(--brass-bright);"><a href="#ref-m214-1" class="footnote-ref" data-ref="1">1</a>, <a href="#ref-m214-2" class="footnote-ref" data-ref="2">2</a></sup> or <sup style="color:var(--brass-bright);"><a href="#ref-m214-1" class="footnote-ref" data-ref="1">1</a>, <a href="#ref-m214-2" class="footnote-ref" data-ref="2">2</a></sup>.
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



    return instructions;
  }




  // ---------- Settings modal ----------
  function openModal(){
    apiKeyInput.value = state.apiKey;
    honorificInput.value = state.honorific;
    const currentThemeRadio = document.querySelector(`input[name="theme"][value="${state.theme}"]`);
    if (currentThemeRadio) currentThemeRadio.checked = true;
    statusArea.innerHTML = '';


    hiddenModelsNote.style.display = 'none';
    modalOverlay.classList.add('open');
    if (state.apiKey) {
      fetchModels(state.apiKey, state.model);
    } else {
      modelSelect.disabled = true;
      modelSelect.innerHTML = '<option value="">Enter a valid API key to fetch available models…</option>';
    }
    if (state.model) loadPricingFieldsForModel(state.model);
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
    state.honorific = newHonorific;
    state.theme = newTheme;
    state.model = newModel;

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
    localStorage.setItem(LS_KEY_HONORIFIC, state.honorific);
    localStorage.setItem(LS_KEY_THEME, state.theme);
    localStorage.setItem(LS_KEY_MODEL, state.model);
    localStorage.setItem(LS_KEY_MODEL_OVERRIDES, JSON.stringify(state.modelOverrides));

    persistPricing();

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

  // ---------- Sending messages ----------
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
      cloudSyncTimer = setTimeout(async () => {
        try {
          const activeConvo = state.conversations.find(c => c.id === state.activeId);
          if (!activeConvo) return;
          const docRef = window.db
            .collection('users')
            .doc(window.auth.currentUser.uid)
            .collection('conversations')
            .doc(state.activeId);
          await docRef.set({
            title: activeConvo.title || 'Main Conversation',
            history: state.history,
            updatedAt: Date.now()
          }, { merge: true });
        } catch (e) {
          console.error(`Cloud sync failed, ${state.honorific}:`, e);
        }
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

    const text = inputEl.value.trim();
    if (!text && pendingAttachments.length === 0) return;

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
    const { bubble: modelBubble } = addModelMessagePlaceholder();
    startThinkingAnimation();

    const contextMessages = state.history.slice(-MAX_TURNS_SENT).map(t => ({ role: t.role, parts: t.parts }));

    try {
          // Waking the voice for mobile browsers
      const wakeUp = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(wakeUp);
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
    const fullSystemInstruction = `Current date and time: ${now}. ${systemInstruction}`;

      if (!systemInstruction) throw new Error("System instruction is empty.");
      
      const url = `https://generativelanguage.googleapis.com/v1beta/${usedModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(state.apiKey)}`;
      const temperature = state.convoType === 'research' ? 0.3 : (state.convoType === 'coding' ? 0.4 : 0.85);
      const body = {
        contents: contextMessages,
        systemInstruction: { parts: [{ text: fullSystemInstruction }] },
        generationConfig: { temperature: temperature }
      };

      if (state.convoType === 'research' || state.convoType === 'cooking') {
        body.tools = [{ googleSearch: {} }];
      }



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
            console.log('Jeeves: groundingMetadata received —', {
              chunkCount: (candidate.groundingMetadata.groundingChunks || []).length,
              supportCount: (candidate.groundingMetadata.groundingSupports || []).length,
              raw: candidate.groundingMetadata
            });
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
          }

          if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            fullText += `\n\n*(Response ended early: ${candidate.finishReason}. You may wish to ask Jeeves to continue.)*`;
          }
        }
      }

      // Speak if voice mode or auto-read is active
      if (isAutoSpeakEnabled) {
        let finalSpeech = fullText.replace(/```[\s\S]*?```/g, ` Please inspect the code block on screen, ${state.honorific}. `);
        speak(finalSpeech);
      }

      // Grounding chunks contain the REAL, verified URIs Google Search found —
      // unlike anything the model might type in prose, these are guaranteed live.
      if (searchGroundingChunks.length) {
        fullText = applyGroundingFootnotes(fullText, searchGroundingChunks, searchGroundingSupports);
        renderMarkdownInto(modelBubble, fullText);
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
    } finally {
      stopThinkingAnimation();
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  // ---------- Speech Recognition ----------
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition && micBtn) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    let baseText = '';

  // Inside the event listener for micBtn click:
    micBtn.addEventListener('click', () => {
      if (micBtn.classList.contains('listening')) {
        recognition.stop();
      } else {
        toggleAutoSpeak(true);
        baseText = inputEl.value ? (inputEl.value.trim() + ' ') : '';
        try { recognition.start(); } catch(err) { console.log("Mic error:", err); }
      }
    });

    recognition.onstart = () => {
      micBtn.classList.add('listening');
    };

    recognition.onspeechend = () => {
      // Do nothing here. 
      // By leaving this empty, we prevent the browser from 
      // automatically shutting down the recording on a pause.
    };

    recognition.onend = () => {
      micBtn.classList.remove('listening');
      // Only restart if the user hasn't manually clicked 'off'
      if (isVoiceRequest) {
        recognition.start();
      }
    };

    recognition.onresult = (event) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      inputEl.value = baseText + currentTranscript;
      autoResizeInput();
      inputEl.focus();
    };


  } else if (micBtn) {
    micBtn.style.display = 'none';
  }

  // ---------- Conversation switcher ----------
  const archiveOverlay = document.getElementById('archive-overlay');
  const archiveContent = document.getElementById('archive-content');
  const closeArchivesBtn = document.getElementById('close-archives');

  async function startNewChat(){
    if (state.history.length > 0 && state.activeId !== 'default') {
      const title = await generateTitle(state.history);
      const convo = state.conversations.find(c => c.id === state.activeId);
      if (convo) convo.title = title;
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
      try { localStorage.setItem(LS_KEY_CONVERSATIONS, JSON.stringify(state.conversations)); } catch(e){}
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
    archiveContent.innerHTML = '';
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
          state.conversations = state.conversations.filter(convo => convo.id !== c.id);
          if (state.activeId === c.id) startNewChat();
          else persistHistory();
          renderArchives();
        }
      });
      row.querySelector('.open-btn').addEventListener('click', () => switchToConversation(c.id));
      archiveContent.appendChild(row);
    });
    archiveOverlay.classList.add('open');
    const searchInput = document.getElementById('search-archives');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
  }

  document.getElementById('search-archives')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const rows = Array.from(document.querySelectorAll('.archive-row'));
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
    
    results.forEach(({row, plainText, count}, i) => {
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

  document.getElementById('new-chat-btn')?.addEventListener('click', startNewChat);
  document.getElementById('archive-btn')?.addEventListener('click', renderArchives);
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
  if (sessionStorage.getItem('jeeves_just_updated')) {
    sessionStorage.removeItem('jeeves_just_updated');
    addSystemNote('Application cache successfully purged and latest files loaded.');
  }
  if (!state.apiKey) {
    setTimeout(openModal, 300);
  }
})();