const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const employeeHandler = require('./api/venio/employees.js');

const root = __dirname;
const port = Number.parseInt(process.env.PORT, 10) || 3000;
const envFile = path.join(root, '.env.local');

if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const contentTypes = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function sendText(res, status, message) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(message);
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendText(res, 405, 'Method not allowed.');
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (_) {
    return sendText(res, 400, 'Bad request.');
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    return sendText(res, 403, 'Forbidden.');
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) return sendText(res, 404, 'Not found.');

    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) sendText(res, 500, 'Unable to read file.');
      else res.destroy();
    });
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/api/venio/employees') {
    req.query = Object.fromEntries(requestUrl.searchParams);
    try {
      await employeeHandler(req, res);
    } catch (_) {
      if (!res.headersSent) sendText(res, 500, 'Internal server error.');
      else res.end();
    }
    return;
  }

  serveStatic(req, res, requestUrl.pathname);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`mandaybook running at http://localhost:${port}`);
  if (!fs.existsSync(envFile)) {
    console.warn('Employee search requires a configured .env.local file.');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Set PORT to use another port.`);
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});
