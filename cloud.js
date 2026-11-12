/* Fino Cloud — вход через Google и синхронизация всех данных Fino (операции, категории, долги, настройки) через Firebase.
   Данные лежат в Firestore: fino_users/{uid}/apps/fino. Видит только владелец аккаунта. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut as fbSignOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* Вставь сюда конфиг из Firebase Console → Project settings → Your apps → Web app (</> Fino) */
const FIREBASE_CONFIG = null;
/* пример:
const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "hanlu-457cf.firebaseapp.com",
  projectId: "hanlu-457cf",
  storageBucket: "hanlu-457cf.appspot.com",
  messagingSenderId: "...",
  appId: "1:...:web:..."
};
*/

/* Вход через Apple: включи после настройки Sign in with Apple (Apple Developer + Firebase → Authentication → Apple) */
const APPLE_ENABLED = false;

const KEYS = { fino: 'fino.v1' };
const META = 'fino.sync.v1';
const MAX = 900000; // Firestore: документ до ~1 МБ
const st = { appleEnabled: !!FIREBASE_CONFIG && APPLE_ENABLED, configured: !!FIREBASE_CONFIG, user: null, status: FIREBASE_CONFIG ? 'out' : 'off', lastSync: null, error: null };
const emit = () => window.dispatchEvent(new CustomEvent('fino-cloud'));
const meta = () => { try { return JSON.parse(localStorage.getItem(META) || '{}'); } catch (e) { return {}; } };
const setMeta = m => { try { localStorage.setItem(META, JSON.stringify(m)); } catch (e) {} };
const readLocal = k => { try { return localStorage.getItem(KEYS[k]); } catch (e) { return null; } };

let auth = null, db = null, unsubs = [], timers = {};

const api = {
  get state() { return st; },
  statusText() {
    if (st.status === 'off') return 'на этом устройстве';
    if (st.status === 'out') return 'на этом устройстве · войди через Google для синхронизации';
    if (st.status === 'syncing') return '☁ синхронизация…';
    if (st.status === 'error') return '⚠ ' + (st.error || 'ошибка синхронизации');
    return '☁ синхронизировано' + (st.lastSync ? ' · ' + new Date(st.lastSync).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '');
  },
  markChanged(k = 'fino') {
    const m = meta(); m[k] = Date.now(); setMeta(m);
    if (st.user) { clearTimeout(timers[k]); timers[k] = setTimeout(() => push(k), 1200); }
  },
  async signIn(kind = 'google') {
    if (!st.configured) throw new Error('not_configured');
    let provider;
    if (kind === 'apple') {
      if (!st.appleEnabled) throw new Error('apple_not_configured');
      provider = new OAuthProvider('apple.com');
      provider.addScope('email'); provider.addScope('name');
      provider.setCustomParameters({ locale: 'ru' });
    } else {
      provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
    }
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    if (standalone) return signInWithRedirect(auth, provider);
    try { await signInWithPopup(auth, provider); }
    catch (e) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) return signInWithRedirect(auth, provider);
      if (e.code !== 'auth/popup-closed-by-user') { st.error = humanError(e); st.status = 'error'; emit(); }
      throw e;
    }
  },
  async signOut() { if (auth) await fbSignOut(auth); },
  /* отзыв согласия: удалить облачную копию */
  async deleteRemote() {
    if (!st.user) return;
    unsubs.forEach(u => u()); unsubs = [];
    for (const k of Object.keys(KEYS)) await deleteDoc(doc(db, 'fino_users', st.user.uid, 'apps', k));
    const m = meta(); if (m.linked) delete m.linked[st.user.uid]; setMeta(m);
  }
};
window.__finoCloud = api;

function humanError(e) {
  const c = e && e.code || '';
  if (c.includes('unauthorized-domain')) return 'домен не разрешён в Firebase (Authorized domains)';
  if (c.includes('permission-denied')) return 'нет доступа к Firestore — проверь правила';
  if (c.includes('network')) return 'нет сети';
  return (e && e.message) || 'ошибка';
}

/* первая привязка устройства: объединяем, чтобы ничего не потерять */
function merge(k, local, remote) {
  if (k === 'fino') {
    const out = Object.assign({}, remote, local);
    const ids = new Set(); out.ops = [];
    for (const o of [...(local.ops || []), ...(remote.ops || [])]) { if (o && !ids.has(o.id)) { ids.add(o.id); out.ops.push(o); } }
    out.cats = {};
    for (const t of ['expense', 'income']) {
      const seen = new Set(); out.cats[t] = [];
      for (const c of [...((local.cats || {})[t] || []), ...((remote.cats || {})[t] || [])]) { if (c && !seen.has(c.id)) { seen.add(c.id); out.cats[t].push(c); } }
    }
    out.budgets = Object.assign({}, remote.budgets, local.budgets);
    out.rules = Object.assign({}, remote.rules, local.rules);
    out.settings = Object.assign({}, remote.settings, local.settings);
    const lid = new Set(), ls = [];
    for (const L of [...((local.debts || {}).loans || []), ...((remote.debts || {}).loans || [])]) { if (L && !lid.has(L.id)) { lid.add(L.id); ls.push(L); } }
    out.debts = { loans: ls, settings: Object.assign({}, (remote.debts || {}).settings, (local.debts || {}).settings) };
    return out;
  }
  return local;
}
const isEmpty = (k, s) => { try { const o = JSON.parse(s || 'null'); if (!o) return true; return !((o.ops && o.ops.length) || (o.debts && o.debts.loans && o.debts.loans.length)); } catch (e) { return true; } };

function applyLocal(k, data, ts) {
  try { localStorage.setItem(KEYS[k], data); } catch (e) {}
  const m = meta(); m[k] = ts; setMeta(m);
  if (k === 'fino' && window.__finoApplyRemote) window.__finoApplyRemote(data);
}

async function push(k) {
  if (!st.user) return;
  const data = readLocal(k); if (data == null) return;
  if (data.length > MAX) { st.status = 'error'; st.error = 'слишком много данных для синхронизации'; emit(); return; }
  const m = meta(); const ts = m[k] || Date.now(); if (!m[k]) { m[k] = ts; setMeta(m); }
  st.status = 'syncing'; emit();
  try {
    await setDoc(doc(db, 'fino_users', st.user.uid, 'apps', k), { data, updatedAt: ts, device: (navigator.userAgent || '').slice(0, 90) });
    st.status = 'on'; st.lastSync = Date.now(); st.error = null;
  } catch (e) { st.status = 'error'; st.error = humanError(e); }
  emit();
}

function subscribe(uid) {
  unsubs.forEach(u => u()); unsubs = [];
  for (const k of Object.keys(KEYS)) {
    let first = true;
    unsubs.push(onSnapshot(doc(db, 'fino_users', uid, 'apps', k), snap => {
      if (snap.metadata.hasPendingWrites) return;
      const m = meta(); const localTs = m[k] || 0; const local = readLocal(k);
      const linked = (m.linked || {})[uid];
      if (first) {
        first = false;
        if (!snap.exists()) { if (local) push(k); else { st.status = 'on'; st.lastSync = Date.now(); emit(); } }
        else {
          const r = snap.data();
          if (!linked && !isEmpty(k, local) && local !== r.data) {
            const merged = JSON.stringify(merge(k, JSON.parse(local), JSON.parse(r.data)));
            applyLocal(k, merged, Date.now()); push(k);
          } else if (r.updatedAt > localTs || (!linked && isEmpty(k, local))) { applyLocal(k, r.data, r.updatedAt); st.status = 'on'; st.lastSync = Date.now(); emit(); }
          else if (localTs > r.updatedAt) push(k);
          else { st.status = 'on'; st.lastSync = Date.now(); emit(); }
        }
        const mm = meta(); mm.linked = Object.assign({}, mm.linked, { [uid]: true }); setMeta(mm);
        return;
      }
      if (snap.exists()) { const r = snap.data(); if (r.updatedAt > localTs) { applyLocal(k, r.data, r.updatedAt); st.lastSync = Date.now(); st.status = 'on'; emit(); } }
    }, e => { st.status = 'error'; st.error = humanError(e); emit(); }));
  }
}

if (FIREBASE_CONFIG) {
  try {
    const app = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app); db = getFirestore(app);
    getRedirectResult(auth).catch(e => { st.status = 'error'; st.error = humanError(e); emit(); });
    onAuthStateChanged(auth, u => {
      st.user = u ? { uid: u.uid, email: u.email, name: u.displayName, photo: u.photoURL } : null;
      if (u) { st.status = 'syncing'; subscribe(u.uid); } else { unsubs.forEach(x => x()); unsubs = []; st.status = 'out'; }
      emit();
    });
  } catch (e) { st.status = 'error'; st.error = humanError(e); }
}
emit();
