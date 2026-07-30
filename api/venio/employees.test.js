const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('./employees.js');

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(value = '') {
      this.body = value;
    }
  };
}

test('parses only Bearer authorization headers', () => {
  assert.equal(handler._test.parseBearerToken('Bearer token-value'), 'token-value');
  assert.equal(handler._test.parseBearerToken('bearer token-value'), 'token-value');
  assert.equal(handler._test.parseBearerToken('Basic token-value'), '');
});

test('builds Venio URLs from a base URL', () => {
  assert.equal(
    handler._test.venioUrl('https://api.gofive.co.th/', 'v1/Employees/Enquiry'),
    'https://api.gofive.co.th/v1/Employees/Enquiry'
  );
});

test('reads cache max-age in milliseconds', () => {
  assert.equal(handler._test.cacheMaxAge('public, max-age=120'), 120_000);
});

test('rejects unsupported methods without calling upstream services', async () => {
  const res = responseRecorder();
  await handler({ method: 'POST', query: {}, headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.deepEqual(JSON.parse(res.body), { error: 'Method not allowed.' });
});

test('rejects keywords shorter than two characters', async () => {
  const res = responseRecorder();
  await handler({
    method: 'GET',
    query: { keyword: ' a ' },
    headers: { authorization: 'Bearer unused' }
  }, res);
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /at least 2 characters/);
});

test('refreshes an expired Venio token and retries employee enquiry once', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  const replies = [
    { status: 200, body: { access_token: 'token-one', expires_in: 300 } },
    { status: 401, body: {} },
    { status: 200, body: { access_token: 'token-two', expires_in: 300 } },
    {
      status: 200,
      body: {
        data: {
          value: [{
            userId: 'user-1',
            staffCode: 'EMP001',
            fullname: 'Patty Saruta',
            role: 'Admin',
            pictureUrl: 'not-returned'
          }]
        }
      }
    }
  ];

  global.fetch = async (url, options) => {
    requests.push({ url, options });
    const reply = replies.shift();
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body
    };
  };
  handler._test.resetTokenCache();

  try {
    const employees = await handler._test.enquiryEmployees(
      {
        baseUrl: 'https://api.gofive.co.th',
        subscriptionKey: 'test-key',
        clientId: 'test-client',
        clientSecret: 'test-secret'
      },
      { keyword: 'Patty', skip: 0, pageLength: 20 }
    );

    assert.equal(requests.length, 4);
    assert.equal(
      requests.filter(({ url }) => url.includes('authorization/connect/token')).length,
      2
    );
    const enquiryBody = JSON.parse(requests[1].options.body);
    assert.equal(enquiryBody.pageLength, 20);
    assert.equal(Object.hasOwn(enquiryBody, 'pagelength'), false);
    assert.deepEqual(employees, [{
      userId: 'user-1',
      staffCode: 'EMP001',
      fullname: 'Patty Saruta'
    }]);
  } finally {
    global.fetch = originalFetch;
    handler._test.resetTokenCache();
  }
});
