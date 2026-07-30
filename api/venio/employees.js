const crypto = require('node:crypto');

const TOKEN_EARLY_REFRESH_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let tokenCache = { accessToken: '', expiresAt: 0 };
let firebaseCertCache = { certificates: {}, expiresAt: 0 };

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function parseBearerToken(header = '') {
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || '';
}

function decodeJwtPart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function cacheMaxAge(header = '') {
  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(header);
  return match ? Number(match[1]) * 1000 : 300_000;
}

async function getFirebaseCertificates(forceRefresh = false) {
  if (!forceRefresh && firebaseCertCache.expiresAt > Date.now()) {
    return firebaseCertCache.certificates;
  }

  const response = await fetch(FIREBASE_CERTS_URL, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error('Firebase certificates unavailable');

  const certificates = await response.json();
  firebaseCertCache = {
    certificates,
    expiresAt: Date.now() + cacheMaxAge(response.headers.get('cache-control'))
  };
  return certificates;
}

async function verifyFirebaseIdToken(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token');

  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  // This public project identifier matches the existing Firebase client config.
  const projectId = 'man-daybook-fa42a';
  const now = Math.floor(Date.now() / 1000);

  if (
    header.alg !== 'RS256' ||
    !header.kid ||
    payload.aud !== projectId ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    payload.sub.length > 128 ||
    typeof payload.exp !== 'number' ||
    payload.exp <= now ||
    typeof payload.iat !== 'number' ||
    payload.iat > now + 60
  ) {
    throw new Error('Invalid ID token claims');
  }

  let certificates = await getFirebaseCertificates();
  if (!certificates[header.kid]) certificates = await getFirebaseCertificates(true);
  const certificate = certificates[header.kid];
  if (!certificate) throw new Error('Unknown ID token key');

  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    certificate,
    Buffer.from(parts[2], 'base64url')
  );
  if (!valid) throw new Error('Invalid ID token signature');
  return payload;
}

function getVenioConfig() {
  const config = {
    baseUrl: process.env.VENIO_BASE_URL?.trim(),
    subscriptionKey: process.env.VENIO_SUBSCRIPTION_KEY,
    clientId: process.env.VENIO_CLIENT_ID,
    clientSecret: process.env.VENIO_CLIENT_SECRET
  };
  if (Object.values(config).some((value) => !value)) {
    throw new Error('Venio environment is incomplete');
  }
  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(config.baseUrl);
  } catch (_) {
    throw new Error('Venio base URL is invalid');
  }
  if (parsedBaseUrl.protocol !== 'https:') {
    throw new Error('Venio base URL must use HTTPS');
  }
  config.baseUrl = parsedBaseUrl.toString();
  return config;
}

function venioUrl(baseUrl, path) {
  return new URL(path, `${baseUrl.replace(/\/+$/, '')}/`).toString();
}

async function getVenioToken(config, forceRefresh = false) {
  if (
    !forceRefresh &&
    tokenCache.accessToken &&
    tokenCache.expiresAt - TOKEN_EARLY_REFRESH_MS > Date.now()
  ) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret
  });
  const response = await fetch(venioUrl(config.baseUrl, 'authorization/connect/token'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Ocp-Apim-Subscription-Key': config.subscriptionKey
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Venio token request failed (${response.status})`);

  const data = await response.json();
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('Venio token response is invalid');
  }

  const expiresIn = Number.isFinite(Number(data.expires_in)) ? Number(data.expires_in) : 300;
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(expiresIn, 1) * 1000
  };
  return tokenCache.accessToken;
}

async function enquiryEmployees(config, input, retryUnauthorized = true) {
  const accessToken = await getVenioToken(config);
  const response = await fetch(venioUrl(config.baseUrl, 'v1/Employees/Enquiry'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': config.subscriptionKey,
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      employeeType: null,
      teamId: null,
      status: null,
      keyWord: input.keyword,
      orderBy: 0,
      skip: input.skip,
      pageLength: input.pageLength,
      type: null
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (response.status === 401 && retryUnauthorized) {
    tokenCache = { accessToken: '', expiresAt: 0 };
    await getVenioToken(config, true);
    return enquiryEmployees(config, input, false);
  }
  if (!response.ok) {
    const error = new Error(`Venio employee request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const values = payload?.data?.value;
  if (!Array.isArray(values)) throw new Error('Venio employee response is invalid');

  return values
    .filter((employee) =>
      employee &&
      typeof employee.userId === 'string' &&
      typeof employee.fullname === 'string'
    )
    .map((employee) => ({
      userId: employee.userId,
      staffCode: typeof employee.staffCode === 'string' ? employee.staffCode : '',
      fullname: employee.fullname
    }));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const keyword = String(req.query?.keyword || '').trim().slice(0, 100);
  const skip = Math.max(0, Math.min(Number.parseInt(req.query?.skip, 10) || 0, 10_000));
  const pageLength = Math.max(
    1,
    Math.min(Number.parseInt(req.query?.pageLength, 10) || 20, 50)
  );
  if (keyword.length < 2) {
    return sendJson(res, 400, { error: 'Search keyword must contain at least 2 characters.' });
  }

  const idToken = parseBearerToken(req.headers.authorization);
  if (!idToken) return sendJson(res, 401, { error: 'Authentication required.' });

  try {
    await verifyFirebaseIdToken(idToken);
  } catch (_) {
    return sendJson(res, 401, { error: 'Authentication required.' });
  }

  try {
    const employees = await enquiryEmployees(
      getVenioConfig(),
      { keyword, skip, pageLength }
    );
    return sendJson(res, 200, { employees });
  } catch (error) {
    if (error.status === 403) {
      return sendJson(res, 403, { error: 'You do not have permission to view employees.' });
    }
    console.error('Venio employee search failed', {
      name: error.name,
      status: error.status || null
    });
    return sendJson(res, 502, { error: 'Unable to load employees. Please try again.' });
  }
};

module.exports._test = {
  parseBearerToken,
  venioUrl,
  cacheMaxAge,
  enquiryEmployees,
  resetTokenCache() {
    tokenCache = { accessToken: '', expiresAt: 0 };
  }
};
