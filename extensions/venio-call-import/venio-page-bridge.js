(() => {
  'use strict';

  if (window.__mandaybookVenioCallBridgeInstalled) return;
  window.__mandaybookVenioCallBridgeInstalled = true;

  const MESSAGE_TYPE = 'MANDAYBOOK_VENIO_CALL_CAPTURE';
  const VENIO_API_PATH = /\/api\//i;

  function getRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input?.url || '';
  }

  function publishPayload(payload) {
    window.VenioCallParser.sanitizeResponses(payload).forEach((capture) => {
      window.postMessage({
        type: MESSAGE_TYPE,
        payload: capture
      }, window.location.origin);
    });
  }

  const originalFetch = window.fetch;
  window.fetch = async function mandaybookObservedFetch(...args) {
    const response = await originalFetch.apply(this, args);
    const requestUrl = getRequestUrl(args[0]);
    if (VENIO_API_PATH.test(requestUrl)) {
      response.clone().json()
        .then(publishPayload)
        .catch(() => {});
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function mandaybookObservedOpen(method, url, ...rest) {
    this.__mandaybookRequestUrl = getRequestUrl(url);
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function mandaybookObservedSend(...args) {
    if (VENIO_API_PATH.test(this.__mandaybookRequestUrl || '')) {
      this.addEventListener('load', () => {
        try {
          const payload = this.responseType === 'json'
            ? this.response
            : JSON.parse(this.responseText);
          publishPayload(payload);
        } catch (_) {}
      }, { once: true });
    }
    return originalSend.apply(this, args);
  };
})();
