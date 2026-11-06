/* ECDECO consent-first analytics layer. No visitor identifiers or lead PII may enter this file's event payloads. */
(() => {
  'use strict';

  const CONSENT_KEY = 'ecdeco_cookie_consent_v1';
  const CONFIG_ENDPOINT = '/api/analytics-config';
  const allowedParameterKeys = new Set([
    'locale', 'page_type', 'project_slug', 'project_type', 'service_scope',
    'content_id', 'depth_percent', 'cta_id', 'cta_location', 'destination_type',
    'contact_context', 'form_name', 'form_version', 'field_key', 'error_type',
    'upload_count_band', 'file_type_group', 'total_size_band', 'property_type',
    'size_band', 'budget_band', 'timeline_band', 'lead_stage', 'lead_status',
    'consultation_mode', 'disqualified_reason', 'qualification_route',
  ]);
  const state = { analytics: false, loaded: false, loading: false, mode: '', pending: [] };

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500,
  });

  const locale = () => document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'zh_hk';
  const copy = () => locale() === 'en' ? {
    title: 'Your website preferences',
    body: 'ECDECO uses essential storage to keep the website and enquiry form secure. With your permission, analytics helps us understand which project and service information is most useful.',
    privacy: 'Privacy Policy',
    reject: 'Use essential only',
    accept: 'Accept analytics',
    settings: 'Cookie settings',
  } : {
    title: '網站使用偏好',
    body: '迪高使用必要儲存功能以維持網站與諮詢表單安全。經你的同意後，我們會使用分析資料，了解哪些案例及服務資訊最有幫助。',
    privacy: '私隱政策',
    reject: '只使用必要功能',
    accept: '接受分析功能',
    settings: 'Cookie 設定',
  };

  function readConsent() {
    try {
      const value = JSON.parse(window.localStorage.getItem(CONSENT_KEY) || 'null');
      return value && value.version === 1 && typeof value.analytics === 'boolean' ? value : null;
    } catch {
      return null;
    }
  }

  function saveConsent(analytics) {
    try {
      window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: 1, analytics, updated_at: new Date().toISOString() }));
    } catch {
      // Preference persistence is optional; the default remains deny when storage is unavailable.
    }
  }

  function removeAnalyticsCookies() {
    const expires = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
    document.cookie.split(';').map((item) => item.trim().split('=')[0]).filter((name) => /^_ga(?:_|$)/.test(name)).forEach((name) => {
      document.cookie = `${name}=; ${expires}`;
      document.cookie = `${name}=; ${expires}; domain=.${location.hostname}`;
    });
  }

  function safeValue(value) {
    const normalized = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    return normalized.slice(0, 80);
  }

  function safeParameters(parameters = {}) {
    return Object.fromEntries(Object.entries(parameters)
      .filter(([key]) => allowedParameterKeys.has(key))
      .map(([key, value]) => [key, typeof value === 'number' ? value : safeValue(value)])
      .filter(([, value]) => value !== '' && value !== undefined && value !== null));
  }

  function getPageType() {
    const path = location.pathname.replace(/^\/(zh-hk|en)(?:\/|$)/, '/').replace(/\/$/, '') || '/';
    if (path === '/') return 'home';
    if (path.startsWith('/projects/')) return 'project';
    if (path === '/projects') return 'projects';
    if (path === '/services') return 'service';
    if (path === '/our-approach') return 'approach';
    if (path === '/process') return 'process';
    if (path === '/consultation') return 'consultation';
    if (path === '/contact') return 'contact';
    if (path === '/journal') return 'journal';
    if (path === '/privacy') return 'privacy';
    return 'other';
  }

  function projectSlug() {
    const match = location.pathname.match(/^\/(?:zh-hk|en)\/projects\/([^/?#]+)\/?$/);
    return match ? safeValue(match[1]) : '';
  }

  function ctaLocation(element) {
    if (element.closest('header,.mobile-menu')) return 'navigation';
    if (element.closest('footer,.site-footer')) return 'footer';
    if (element.closest('.project-hero,.project-story,.project-gallery,.next-project')) return 'project_body';
    if (element.closest('.hero,.consultation-hero')) return 'hero';
    if (element.closest('.service-cta,.service-detail,.services-strip')) return 'service_body';
    return 'body';
  }

  function ctaId(element) {
    const text = safeValue(element.getAttribute('aria-label') || element.textContent || 'consultation');
    return `${ctaLocation(element)}_${text || 'consultation'}`.slice(0, 80);
  }

  function flushPending() {
    while (state.pending.length) {
      const { name, parameters } = state.pending.shift();
      if (state.mode === 'gtm') {
        window.dataLayer.push({ event: name, ...parameters });
      } else if (state.mode === 'ga4') {
        window.gtag('event', name, parameters);
      }
    }
  }

  function track(name, parameters = {}) {
    if (!state.analytics) return false;
    const payload = safeParameters({ locale: locale(), page_type: getPageType(), ...parameters });
    if (state.loaded || state.mode === 'gtm') {
      if (state.mode === 'gtm') window.dataLayer.push({ event: name, ...payload });
      else window.gtag('event', name, payload);
      return true;
    }
    state.pending.push({ name, parameters: payload });
    return true;
  }
  window.ecdecoTrack = track;

  function validMeasurementId(value) { return /^G-[A-Z0-9]{6,}$/i.test(String(value || '').trim()); }
  function validContainerId(value) { return /^GTM-[A-Z0-9]{4,}$/i.test(String(value || '').trim()); }

  function loadGtm(containerId) {
    state.mode = 'gtm';
    state.loaded = true;
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
    document.head.append(script);
    flushPending();
  }

  function loadGa4(measurementId) {
    state.mode = 'ga4';
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.addEventListener('load', () => {
      state.loaded = true;
      window.gtag('js', new Date());
      window.gtag('config', measurementId, {
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      flushPending();
    }, { once: true });
    document.head.append(script);
  }

  async function loadAnalytics() {
    if (!state.analytics || state.loading || state.loaded || state.mode === 'gtm') return;
    state.loading = true;
    try {
      const endpoint = window.ECDECOApi ? window.ECDECOApi.endpoint(CONFIG_ENDPOINT) : CONFIG_ENDPOINT;
      const response = await fetch(endpoint, { credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
      const config = response.ok ? await response.json() : {};
      if (validContainerId(config.containerId)) loadGtm(String(config.containerId).trim().toUpperCase());
      else if (validMeasurementId(config.measurementId)) loadGa4(String(config.measurementId).trim().toUpperCase());
    } catch {
      // Tracking remains disabled when the public runtime configuration is unavailable.
    } finally {
      state.loading = false;
    }
  }

  function applyConsent(analytics, { persist = true } = {}) {
    state.analytics = Boolean(analytics);
    window.gtag('consent', 'update', {
      analytics_storage: state.analytics ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    if (persist) saveConsent(state.analytics);
    if (state.analytics) loadAnalytics();
    else removeAnalyticsCookies();
  }

  function removeBanner() {
    document.getElementById('ecdeco-consent-banner')?.remove();
  }

  function openPreferences() {
    removeBanner();
    const text = copy();
    const panel = document.createElement('section');
    panel.id = 'ecdeco-consent-banner';
    panel.className = 'ecdeco-consent-banner';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'ecdeco-consent-title');
    panel.innerHTML = `<div class="ecdeco-consent-banner__card"><p class="ecdeco-consent-banner__eyebrow">ECDECO / PREFERENCES</p><h2 id="ecdeco-consent-title">${text.title}</h2><p>${text.body} <a href="/${locale() === 'en' ? 'en' : 'zh-hk'}/privacy">${text.privacy}</a>。</p><div class="ecdeco-consent-banner__actions"><button type="button" class="ecdeco-consent-banner__secondary" data-ecdeco-consent="reject">${text.reject}</button><button type="button" class="ecdeco-consent-banner__primary" data-ecdeco-consent="accept">${text.accept}</button></div></div>`;
    document.body.append(panel);
    panel.querySelector('[data-ecdeco-consent="accept"]')?.focus();
    panel.addEventListener('click', (event) => {
      const action = event.target.closest('[data-ecdeco-consent]')?.dataset.ecdecoConsent;
      if (!action) return;
      applyConsent(action === 'accept');
      removeBanner();
    });
  }

  function ensurePreferencesButton() {
    if (document.getElementById('ecdeco-consent-trigger')) return;
    const text = copy();
    const button = document.createElement('button');
    button.id = 'ecdeco-consent-trigger';
    button.type = 'button';
    button.className = 'ecdeco-consent-trigger';
    button.textContent = text.settings;
    button.addEventListener('click', openPreferences);
    document.body.append(button);
  }

  function initialiseConsent() {
    const saved = readConsent();
    if (saved) applyConsent(saved.analytics, { persist: false });
    else openPreferences();
    ensurePreferencesButton();
  }

  function trackRouteIntent() {
    const type = getPageType();
    if (type === 'project' && projectSlug()) {
      track('view_project', { project_slug: projectSlug(), project_type: 'residential' });
    } else if (type === 'service') {
      track('view_service', { service_scope: 'overview' });
    } else if (type === 'consultation') {
      track('view_consultation', { form_name: 'project_consultation' });
    }
  }

  function initialiseContentDepth() {
    const reached = new Set();
    let scheduled = false;
    const report = () => {
      scheduled = false;
      const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
      const depth = height <= 0 ? 100 : Math.round((window.scrollY / height) * 100);
      [50, 75].forEach((threshold) => {
        if (depth >= threshold && !reached.has(threshold)) {
          reached.add(threshold);
          track('content_depth', { depth_percent: threshold, content_id: projectSlug() || getPageType() });
        }
      });
    };
    window.addEventListener('scroll', () => {
      if (!scheduled) { scheduled = true; requestAnimationFrame(report); }
    }, { passive: true });
    report();
  }

  function initialiseInteractionTracking() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest?.('a[href]');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      if (href.startsWith('mailto:')) {
        track('email_click', { contact_context: ctaLocation(link) });
      } else if (/\/(?:zh-hk|en)\/consultation\/?(?:$|[?#])/.test(href)) {
        track('cta_click', { cta_id: ctaId(link), cta_location: ctaLocation(link), destination_type: 'consultation' });
      }
    }, true);

    document.addEventListener('focusin', (event) => {
      const form = event.target.closest?.('form.inquiry-form');
      if (form && !form.dataset.ecdecoAnalyticsStarted) {
        form.dataset.ecdecoAnalyticsStarted = 'true';
        track('form_start', { form_name: 'project_consultation', form_version: 'v1' });
      }
    }, true);

    document.addEventListener('invalid', (event) => {
      const field = event.target;
      if (field instanceof HTMLElement && field.closest('form.inquiry-form')) {
        track('form_field_error', { form_name: 'project_consultation', field_key: safeValue(field.getAttribute('name') || 'unknown'), error_type: 'invalid' });
      }
    }, true);

    document.addEventListener('ecdeco:lead-error', (event) => {
      const detail = safeParameters(event.detail || {});
      track('form_field_error', { form_name: 'project_consultation', field_key: detail.field_key || 'server', error_type: detail.error_type || 'submission_rejected' });
    });

    document.addEventListener('ecdeco:lead-submitted', (event) => {
      const detail = safeParameters(event.detail || {});
      const base = { form_name: 'project_consultation', form_version: 'v1', ...detail };
      track('form_submit', base);
      if (detail.upload_count_band && detail.upload_count_band !== '0') {
        track('file_upload_success', { form_name: 'project_consultation', upload_count_band: detail.upload_count_band, file_type_group: detail.file_type_group || 'mixed' });
      }
      track('generate_lead', base);
    });
  }

  function start() {
    initialiseConsent();
    initialiseInteractionTracking();
    trackRouteIntent();
    initialiseContentDepth();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
