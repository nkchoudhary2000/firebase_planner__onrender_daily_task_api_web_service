/**
 * Built-in zero-dependency static file server & API reverse-proxy for local development
 * Gracefully auto-selects next port if default is busy.
 * Proxies /api/* and /auth/* to Render web service to bypass browser CORS restrictions during development.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const net = require('net');

const DEFAULT_PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');
const TARGET_API_URL = process.env.API_TARGET || 'https://chronos-planner-app.onrender.com';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token, Accept, Origin, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function handleProxy(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let targetParsed;
  try {
    targetParsed = new URL(TARGET_API_URL);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid TARGET_API_URL configuration' }));
    return;
  }

  const isHttps = targetParsed.protocol === 'https:';
  const proxyClient = isHttps ? https : http;

  const targetPath = req.url;
  const proxyHeaders = { ...req.headers };
  proxyHeaders.host = targetParsed.host;

  const options = {
    hostname: targetParsed.hostname,
    port: targetParsed.port || (isHttps ? 443 : 80),
    path: targetPath,
    method: req.method,
    headers: proxyHeaders,
    timeout: 70000
  };

  const proxyReq = proxyClient.request(options, (proxyRes) => {
    const responseHeaders = { ...proxyRes.headers };
    responseHeaders['access-control-allow-origin'] = '*';
    responseHeaders['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
    responseHeaders['access-control-allow-headers'] = 'Content-Type, Authorization, X-API-Token, Accept, Origin, X-Requested-With';

    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      setCorsHeaders(res);
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Gateway Timeout: Render cold start took longer than 70s. Please retry.'
      }));
    }
  });

  proxyReq.on('error', (err) => {
    console.error(`[Dev Proxy Error] ${req.method} ${req.url} ->`, err.message);
    if (!res.headersSent) {
      setCorsHeaders(res);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Proxy Error connecting to Render backend: ${err.message}`
      }));
    }
  });

  req.pipe(proxyReq);
}

function requestHandler(req, res) {
  // CORS Preflight for any route
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = req.url.split('?')[0];

  // Proxy API and Auth routes directly to Render backend
  if (reqUrl.startsWith('/api/') || reqUrl === '/api' || reqUrl.startsWith('/auth/') || reqUrl === '/auth') {
    handleProxy(req, res);
    return;
  }

  let reqPath = decodeURI(reqUrl);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  let filePath = path.join(PUBLIC_DIR, reqPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
        return;
      }

      setCorsHeaders(res);
      res.writeHead(200, {
        'Content-Type': contentType
      });
      res.end(content);
    });
  });
}

function findAvailablePort(startPort, callback) {
  const tester = net.createServer();
  tester.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      findAvailablePort(startPort + 1, callback);
    } else {
      callback(err, null);
    }
  });
  tester.once('listening', () => {
    tester.close(() => {
      callback(null, startPort);
    });
  });
  tester.listen(startPort);
}

findAvailablePort(DEFAULT_PORT, (err, port) => {
  if (err) {
    console.error('Failed to find open port:', err);
    process.exit(1);
  }

  const server = http.createServer(requestHandler);
  server.listen(port, () => {
    console.log(`\n🚀 Chronos Daily Task Planner is running!`);
    console.log(`   ➜  Local:        http://localhost:${port}/`);
    console.log(`   ➜  API Proxy:    Forwarding /api & /auth to ${TARGET_API_URL}\n`);
  });
});
