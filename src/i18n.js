'use strict';
/* ============================================================
   I18N — proste tłumaczenia UI (pl/en/de), język trzymany w localStorage
   ============================================================ */

const I18N_LANGS = ['pl', 'en', 'de'];
const I18N_STORAGE_KEY = 'hexgeneral.lang';
const I18N_FALLBACK = 'pl';

const i18n = {
  lang: I18N_FALLBACK,

  setLanguage(lang) {
    if (!I18N_LANGS.includes(lang)) lang = I18N_FALLBACK;
    this.lang = lang;
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(I18N_STORAGE_KEY, lang); } catch (e) { /* np. tryb prywatny */ }
    }
  },

  // klucz "a.b.c" -> string w bieżącym języku; brakujący klucz spada na polski
  // (źródło prawdy), a jeśli i tam go nie ma — zwraca sam klucz, żeby brak
  // tłumaczenia było widoczne zamiast pustego miejsca
  t(key, vars) {
    const dict = (typeof I18N_DATA !== 'undefined' && I18N_DATA[this.lang]) || {};
    const fallbackDict = (typeof I18N_DATA !== 'undefined' && I18N_DATA[I18N_FALLBACK]) || {};
    let str = dict[key] !== undefined ? dict[key] : fallbackDict[key];
    if (str === undefined) return key;
    if (vars) {
      for (const k in vars) str = str.split(`{{${k}}}`).join(vars[k]);
    }
    return str;
  },
};

function i18nInit() {
  let saved = null;
  if (typeof localStorage !== 'undefined') {
    try { saved = localStorage.getItem(I18N_STORAGE_KEY); } catch (e) { /* np. tryb prywatny */ }
  }
  i18n.setLanguage(saved || I18N_FALLBACK);
}

// odświeża cały widoczny tekst po zmianie języka: statyczne etykiety
// ([data-i18n]/[data-i18n-html] w index.html) + aktualnie widoczny ekran
// (lobby/opcje/gra), który ma własną logikę renderowania w menu.js/ui.js
function applyI18n() {
  if (typeof document === 'undefined') return;
  document.title = i18n.t('app.pageTitle');
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = i18n.t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = i18n.t(el.getAttribute('data-i18n-html'));
  });
  if (typeof renderLangPicker === 'function') renderLangPicker();
  if (typeof state === 'undefined' || !state) return;
  if (state.screen === 'sp-setup' && typeof renderSpSetup === 'function') renderSpSetup();
  else if (state.screen === 'mp-setup' && typeof renderMpSetup === 'function') renderMpSetup();
  else if (state.screen === 'options' && typeof renderOptions === 'function') renderOptions();
  else if (state.screen === 'menu' && typeof refreshMainMenu === 'function') refreshMainMenu(); // etykieta „Kontynuuj" (dynamiczna, bez data-i18n)
  else if (state.screen === 'game' && typeof updateUI === 'function') updateUI();
}

if (typeof document !== 'undefined') i18nInit();
