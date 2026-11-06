/* Static-site API bridge. No Firebase credentials, cookies or UI side effects. */
(function (window) {
  'use strict';

  const paths = new Set(['/api/leads', '/api/estate-lookup', '/api/analytics-config']);
  const requests = new WeakMap();
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const errorCodes = new Set(['attachment_storage_unavailable', 'idempotency_conflict', 'too_many_requests']);
  const failure = (code) => {
    const error = new Error('Unable to send your request. Please try again.');
    if (errorCodes.has(code)) error.code = code;
    return error;
  };

  function endpoint(path) {
    if (!paths.has(path)) throw new Error('Unsupported API endpoint.');
    const origin = window.__ECDECO_API_ORIGIN__;
    if (origin === undefined || origin === '') return path;
    if (typeof origin !== 'string' || !/^https?:\/\/[^/?#\\\s@]+$/i.test(origin)) {
      throw new Error('Invalid API origin.');
    }
    let url;
    try { url = new URL(origin); } catch (_) { throw new Error('Invalid API origin.'); }
    const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' ||
      /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
    if (url.username || url.password ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
      throw new Error('Invalid API origin.');
    }
    return url.origin + path;
  }

  function signature(data) {
    return JSON.stringify(Array.from(data.entries(), ([name, value]) => [name,
      typeof value === 'string' ? value : {
        name: value.name, size: value.size, type: value.type, lastModified: value.lastModified
      }
    ]));
  }

  // Returns the exact same Promise while a form's request is in flight.
  // timeoutMs defaults to 90 seconds and is clamped to 1–120 seconds.
  // Success resolves to {ok: true, id: UUID} or {ok: true, ignored: true}.
  function submit(form, options = {}) {
    try {
      let state = requests.get(form);
      if (state && state.pending) return state.pending;
      const locale = options.locale === undefined ? 'en' : options.locale;
      if (locale !== 'en' && locale !== 'zh-hk') throw failure();
      const requestedTimeout = options.timeoutMs === undefined ? 90000 : options.timeoutMs;
      if (!Number.isFinite(requestedTimeout)) throw failure();
      const timeoutMs = Math.max(1000, Math.min(120000, requestedTimeout));
      const target = endpoint('/api/leads');
      const data = new FormData(form);
      data.delete('locale');
      data.append('locale', locale);
      const fingerprint = signature(data);
      if (!state) {
        state = { pending: null, key: null, signature: null };
        requests.set(form, state);
      }
      if (!state.key || state.signature !== fingerprint) {
        state.key = window.crypto.randomUUID();
        state.signature = fingerprint;
      }
      const controller = new AbortController();
      let timer;
      state.pending = Promise.resolve().then(async () => {
        timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await window.fetch(target, {
            method: 'POST',
            body: data,
            headers: { Accept: 'application/json', 'Idempotency-Key': state.key },
            credentials: 'omit',
            signal: controller.signal
          });
          const contentType = response.headers.get('content-type') || '';
          if (!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
            throw failure();
          }
          const result = await response.json();
          if (!response.ok || !result || result.ok !== true || result.error != null) throw failure(result?.code);
          let success;
          if (result.ignored === true) success = { ok: true, ignored: true };
          else if (typeof result.id === 'string' && uuid.test(result.id)) {
            success = { ok: true, id: result.id };
          } else throw failure();
          state.key = null;
          state.signature = null;
          return success;
        } catch (error) {
          // Keep the key on failure: an interrupted response may have persisted.
          throw failure(error?.code);
        } finally {
          clearTimeout(timer);
        }
      }).finally(() => { state.pending = null; });
      return state.pending;
    } catch (_) {
      return Promise.reject(failure());
    }
  }

  window.ECDECOApi = Object.freeze({ endpoint, submit });
})(window);
