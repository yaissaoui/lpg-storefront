#!/usr/bin/env node
/*
 * Local dev only. Forwards http://<host>:3001/graphql to COMMERCE_GRAPHQL_URL and adds CORS
 * headers for http://localhost:3000 (aem up) only. Zero dependencies, Node 24.
 *
 *   COMMERCE_GRAPHQL_URL=https://<sandbox host>/graphql node tools/dev-graphql-proxy.mjs
 *
 * It forwards the Store header, never forwards cookies, and logs no request body.
 * Production must not use it: EDS should reach Commerce on the same origin (CDN route) or
 * through API Mesh. See README.md.
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export const ALLOWED_ORIGIN = 'http://localhost:3000';
const MAX_BODY = 1024 * 1024;
const FORWARD_REQUEST_HEADERS = ['store', 'content-type', 'accept', 'content-currency'];
const FORWARD_RESPONSE_HEADERS = ['content-type', 'cache-control', 'x-magento-cache-id', 'x-cache', 'age'];

function corsHeaders(origin) {
  if (origin !== ALLOWED_ORIGIN) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Store, Accept, Content-Currency',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * @param {object} opts
 * @param {string} opts.target upstream GraphQL URL
 * @param {Function} [opts.fetchImpl] for tests
 * @param {Function} [opts.log] logger, defaults to console.log
 */
export function createProxyServer({ target, fetchImpl = fetch, log = console.log }) {
  const upstream = new URL(target);
  return http.createServer(async (req, res) => {
    const { origin } = req.headers;
    const cors = corsHeaders(origin);
    const url = new URL(req.url, 'http://proxy.local');
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { ...cors, ...headers });
      res.end(body);
    };

    if (origin && origin !== ALLOWED_ORIGIN) {
      send(403, JSON.stringify({ errors: [{ message: `Origin ${origin} is not allowed` }] }), { 'Content-Type': 'application/json' });
      return;
    }
    if (url.pathname !== '/graphql') {
      send(404, JSON.stringify({ errors: [{ message: 'Only /graphql is proxied' }] }), { 'Content-Type': 'application/json' });
      return;
    }
    if (req.method === 'OPTIONS') {
      send(204, '');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      send(405, '', { Allow: 'GET, POST, OPTIONS' });
      return;
    }

    const started = Date.now();
    try {
      const headers = {};
      FORWARD_REQUEST_HEADERS.forEach((h) => {
        if (req.headers[h]) headers[h] = req.headers[h];
      });
      const out = new URL(upstream);
      url.searchParams.forEach((v, k) => out.searchParams.set(k, v));
      const init = { method: req.method, headers, signal: AbortSignal.timeout(30000) };
      if (req.method === 'POST') init.body = await readBody(req);
      const resp = await fetchImpl(out, init);
      const body = Buffer.from(await resp.arrayBuffer());
      const passed = {};
      FORWARD_RESPONSE_HEADERS.forEach((h) => {
        const v = resp.headers.get(h);
        if (v) passed[h] = v;
      });
      send(resp.status, body, passed);
      log(`${req.method} /graphql store=${headers.store || '-'} -> ${resp.status} ${Date.now() - started}ms`);
    } catch (e) {
      const status = e.status || 502;
      send(status, JSON.stringify({ errors: [{ message: `Proxy error: ${e.message}` }] }), { 'Content-Type': 'application/json' });
      log(`${req.method} /graphql -> ${status} ${e.message}`);
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const target = process.env.COMMERCE_GRAPHQL_URL;
  if (!target) {
    console.error('COMMERCE_GRAPHQL_URL is not set. Example: COMMERCE_GRAPHQL_URL=https://<sandbox host>/graphql');
    process.exit(1);
  }
  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || '0.0.0.0';
  createProxyServer({ target }).listen(port, host, () => {
    console.log(`GraphQL dev proxy on http://${host}:${port}/graphql -> ${new URL(target).origin}${new URL(target).pathname}, CORS for ${ALLOWED_ORIGIN}`);
  });
}
