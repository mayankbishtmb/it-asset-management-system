process.env.DB_FILE = ':memory:'; // tests use a temporary database

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const app = require('../server');

let server;
let base;

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server.close();
  if (server.closeAllConnections) server.closeAllConnections();
});

async function call(path, method = 'GET', body, token) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, data };
}

async function tokenFor(email, password) {
  const r = await call('/login', 'POST', { email, password });
  return r.data.token;
}

test('TC1: login fails with a wrong password', async () => {
  const r = await call('/login', 'POST', { email: 'admin@itam.com', password: 'wrong' });
  assert.strictEqual(r.status, 401);
});

test('TC2: duplicate serial number is rejected', async () => {
  const admin = await tokenFor('admin@itam.com', 'admin123');
  const r = await call('/assets', 'POST',
    { name: 'Another Laptop', type: 'Laptop', serial_no: 'DL-48213' }, admin);
  assert.strictEqual(r.status, 409);
});

test('TC3: an already-assigned asset cannot be assigned again', async () => {
  const admin = await tokenFor('admin@itam.com', 'admin123');
  const r = await call('/assign', 'POST', { asset_id: 1, user_id: 3 }, admin);
  assert.strictEqual(r.status, 400);
});

test('TC4: returning an asset makes it Available again', async () => {
  const admin = await tokenFor('admin@itam.com', 'admin123');

  const created = await call('/assets', 'POST',
    { name: 'Test Mouse', type: 'Mouse', serial_no: 'TM-1' }, admin);
  assert.strictEqual(created.status, 201);
  const assetId = created.data.id;

  const assigned = await call('/assign', 'POST', { asset_id: assetId, user_id: 2 }, admin);
  assert.strictEqual(assigned.status, 201);

  const list = await call('/assignments', 'GET', null, admin);
  const row = list.data.find((s) => s.serial_no === 'TM-1' && !s.returned_date);
  assert.ok(row, 'active assignment should exist');

  const ret = await call('/return/' + row.id, 'POST', null, admin);
  assert.strictEqual(ret.status, 200);

  const after = await call('/assets?search=TM-1', 'GET', null, admin);
  assert.strictEqual(after.data[0].status, 'Available');
});

test('TC5: an employee cannot access admin APIs', async () => {
  const emp = await tokenFor('rishabh@itam.com', 'emp123');
  const r = await call('/assets', 'GET', null, emp);
  assert.strictEqual(r.status, 403);
});

test('TC6: repair flow changes asset status and cannot skip steps', async () => {
  const admin = await tokenFor('admin@itam.com', 'admin123');
  const emp = await tokenFor('rishabh@itam.com', 'emp123');

  const created = await call('/repairs', 'POST',
    { asset_id: 1, issue: 'Charger not working', priority: 'High' }, emp);
  assert.strictEqual(created.status, 201);
  const id = created.data.id;

  let a = await call('/assets?search=DL-48213', 'GET', null, admin);
  assert.strictEqual(a.data[0].status, 'Maintenance');

  const skip = await call('/repairs/' + id, 'PATCH', { status: 'Fixed' }, admin);
  assert.strictEqual(skip.status, 400);

  const step1 = await call('/repairs/' + id, 'PATCH', { status: 'In repair' }, admin);
  assert.strictEqual(step1.status, 200);
  const step2 = await call('/repairs/' + id, 'PATCH', { status: 'Fixed' }, admin);
  assert.strictEqual(step2.status, 200);

  a = await call('/assets?search=DL-48213', 'GET', null, admin);
  assert.strictEqual(a.data[0].status, 'Assigned');
});

test("TC7: an employee cannot report an issue on someone else's asset", async () => {
  const emp = await tokenFor('rishabh@itam.com', 'emp123');
  const r = await call('/repairs', 'POST', { asset_id: 3, issue: 'Not mine' }, emp);
  assert.strictEqual(r.status, 403);
});