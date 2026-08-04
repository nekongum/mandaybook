(() => {
  'use strict';

  const PAGE_ORIGIN = 'https://app.veniocrm.com';
  window.addEventListener('message', (event) => {
    if (
      event.source !== window ||
      event.origin !== PAGE_ORIGIN ||
      event.data?.type !== 'MANDAYBOOK_VENIO_CALL_CAPTURE'
    ) return;

    chrome.runtime.sendMessage({
      type: 'STORE_VENIO_CALL_CAPTURE',
      payload: event.data.payload
    }).catch(() => {});
  });
})();
