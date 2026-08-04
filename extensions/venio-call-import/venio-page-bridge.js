(() => {
  'use strict';

  if (window.__mandaybookVenioCallBridgeInstalled) return;
  window.__mandaybookVenioCallBridgeInstalled = true;

  const MESSAGE_TYPE = 'MANDAYBOOK_VENIO_CALL_CAPTURE';
  const CONVERSATION_PATH = /\/api\/V4\/Customer\/CustomerConversation\/(\d+)/i;

  function getRequestUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input?.url || '';
  }

  function customerIdFromUrl(url) {
    const match = CONVERSATION_PATH.exec(url || '');
    return match ? Number(match[1]) : null;
  }

  function publishPayload(payload, requestUrl) {
    const requestedCustomerId = customerIdFromUrl(requestUrl);
    if (!Number.isSafeInteger(requestedCustomerId) || requestedCustomerId <= 0) return;
    window.postMessage({
      type: MESSAGE_TYPE,
      payload: window.VenioCallParser.sanitizeResponse(payload, requestedCustomerId)
    }, window.location.origin);
  }

  const originalFetch = window.fetch;
  window.fetch = async function mandaybookObservedFetch(...args) {
    const response = await originalFetch.apply(this, args);
    const requestUrl = getRequestUrl(args[0]);
    if (CONVERSATION_PATH.test(requestUrl)) {
      response.clone().json()
        .then((payload) => publishPayload(payload, requestUrl))
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
    if (CONVERSATION_PATH.test(this.__mandaybookRequestUrl || '')) {
      this.addEventListener('load', () => {
        try {
          publishPayload(JSON.parse(this.responseText), this.__mandaybookRequestUrl);
        } catch (_) {}
      }, { once: true });
    }
    return originalSend.apply(this, args);
  };
})();
