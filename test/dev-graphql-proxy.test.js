import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProxyServer, ALLOWED_ORIGIN } from '../tools/dev-graphql-proxy.mjs';

async function withProxy(fn) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), method: init.method, headers: init.headers });
    return new Response(JSON.stringify({ data: { ok: true } }), { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'a=b' } });
  };
  const server = createProxyServer({ target: 'https://sandbox.example.com/graphql', fetchImpl, log: () => {} });
  await new Promise((r) => { server.listen(0, '127.0.0.1', r); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base, seen);
  } finally {
    server.close();
  }
}

test('proxy forwards GET and POST with the Store header and CORS for localhost:3000', () => withProxy(async (base, seen) => {
  const get = await fetch(`${base}/graphql?query=%7Ba%7D`, { headers: { Origin: ALLOWED_ORIGIN, Store: 'wellbox_fr', Cookie: 'secret=1' } });
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
  assert.equal(get.headers.get('set-cookie'), null, 'cookies never come back');
  assert.equal(seen[0].url, 'https://sandbox.example.com/graphql?query=%7Ba%7D');
  assert.equal(seen[0].headers.store, 'wellbox_fr');
  assert.equal(seen[0].headers.cookie, undefined, 'cookies never go out');

  const post = await fetch(`${base}/graphql`, {
    method: 'POST', headers: { Origin: ALLOWED_ORIGIN, Store: 'fr', 'Content-Type': 'application/json' }, body: '{"query":"{a}"}',
  });
  assert.equal(post.status, 200);
  assert.equal(seen[1].method, 'POST');
}));

test('proxy answers preflight and rejects other origins and paths', () => withProxy(async (base) => {
  const pre = await fetch(`${base}/graphql`, { method: 'OPTIONS', headers: { Origin: ALLOWED_ORIGIN } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-headers'), /Store/);
  const other = await fetch(`${base}/graphql`, { headers: { Origin: 'http://evil.example.com' } });
  assert.equal(other.status, 403);
  assert.equal(other.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(`${base}/admin`)).status, 404);
}));
