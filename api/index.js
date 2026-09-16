import net from 'node:net';

// Prevent Node 20 IPv6 timeouts on Vercel Serverless
if (net.setDefaultAutoSelectFamily) {
  net.setDefaultAutoSelectFamily(false);
}

import app from '../server/index.js';

export default function handler(req, res) {
  const rawUrl = req.originalUrl || req.url || '';
  if (rawUrl.startsWith('/api')) {
    req.url = rawUrl;
  } else if (!req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
}

