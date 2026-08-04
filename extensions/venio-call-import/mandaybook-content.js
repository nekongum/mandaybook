(() => {
  'use strict';

  const allowedOrigins = new Set(['http://127.0.0.1:3000', 'http://localhost:3000']);
  if (!allowedOrigins.has(window.location.origin)) return;

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const request = event.data;
    if (!request?.requestId) return;

    let extensionMessage;
    if (request.type === 'VENIO_CUSTOMER_CONTEXT_REQUEST') {
      extensionMessage = { type: 'GET_LATEST_VENIO_CUSTOMER' };
    } else if (request.type === 'VENIO_CALL_TIME_IMPORT_REQUEST') {
      extensionMessage = {
        type: 'GET_VENIO_CALL_DATA',
        customerId: request.payload?.customerId,
        implementorUserId: request.payload?.implementorUserId
      };
    } else {
      return;
    }

    chrome.runtime.sendMessage(extensionMessage)
      .then((response) => {
        window.postMessage({
          type: 'VENIO_EXTENSION_RESPONSE',
          requestId: request.requestId,
          ok: Boolean(response?.ok),
          payload: response?.payload ?? null,
          error: response?.error || ''
        }, window.location.origin);
      })
      .catch(() => {
        window.postMessage({
          type: 'VENIO_EXTENSION_RESPONSE',
          requestId: request.requestId,
          ok: false,
          payload: null,
          error: 'Venio extension is unavailable.'
        }, window.location.origin);
      });
  });
})();
