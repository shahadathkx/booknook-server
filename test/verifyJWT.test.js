import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { verifyJWT } from '../dist/middleware/verifyJWT.js';

let jwksServer;
let jwksUrl;
let keyPair;
let publicJwk;

test.before(async () => {

  keyPair = await generateKeyPair('RS256');
  publicJwk = await exportJWK(keyPair.publicKey);
  publicJwk.kid = 'test-key-id-1';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';


  await new Promise((resolve) => {
    jwksServer = http.createServer((req, res) => {
      if (req.url === '/jwks.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keys: [publicJwk] }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    jwksServer.listen(0, () => {
      const port = jwksServer.address().port;
      jwksUrl = `http://localhost:${port}/jwks.json`;
      process.env.AUTH_JWKS_URL = jwksUrl;
      resolve();
    });
  });
});

test.after(async () => {
  if (jwksServer) {
    await new Promise((resolve) => jwksServer.close(resolve));
  }
});

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
  };
  return res;
}

test('verifyJWT rejects request without Authorization header', async () => {
  const req = { headers: {} };
  const res = createMockRes();
  let nextCalled = false;

  await verifyJWT(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(Object.keys(res.jsonData), ['message']);
  assert.match(res.jsonData.message, /missing or malformed/i);
});

test('verifyJWT rejects non-Bearer Authorization header', async () => {
  const req = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
  const res = createMockRes();
  let nextCalled = false;

  await verifyJWT(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(Object.keys(res.jsonData), ['message']);
});

test('verifyJWT rejects invalid / untrusted token', async () => {
  const req = { headers: { authorization: 'Bearer invalid.jwt.token' } };
  const res = createMockRes();
  let nextCalled = false;

  await verifyJWT(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(Object.keys(res.jsonData), ['message']);
  assert.match(res.jsonData.message, /invalid, expired, or untrusted/i);
});

test('verifyJWT successfully verifies BetterAuth JWT and attaches req.user', async () => {

  const token = await new SignJWT({
    email: 'reader@booknook.library',
    name: 'Jane Reader',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-id-1' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(keyPair.privateKey);

  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createMockRes();
  let nextCalled = false;

  await verifyJWT(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.ok(req.user, 'req.user should be attached');
  assert.equal(req.user.email, 'reader@booknook.library');
  assert.equal(req.user.name, 'Jane Reader');
});
