const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { db, hash } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => { if (err) next(); });
});

// ---------------- Auth helpers ----------------
const sessions = new Map(); // token -> user

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const user = token && sessions.get(token);
  if (!user) return res.status(401).json({ error: 'Please log in' });
  req.user = user;
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only' });
  }
  next();
}

function recordActivity(actor, action, entityType, entityId, details = '') {
  db.prepare(`INSERT INTO activity_log
    (actor_user_id, actor_name, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(actor.id, actor.name, action, entityType, entityId, details);
}

const today = () => new Date().toISOString().slice(0, 10);

// ---------------- Login ----------------
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const u = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(String(email).trim().toLowerCase());
  if (!u || u.password !== hash(password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  const user = { id: u.id, name: u.name, email: u.email, role: u.role };
  sessions.set(token, user);
  res.json({ token, user });
});

// ---------------- Dashboard stats ----------------
app.get('/api/stats', auth, adminOnly, (req, res) => {
  const count = (s) =>
    db.prepare('SELECT COUNT(*) AS c FROM assets WHERE status = ?').get(s).c;
  const total = db.prepare('SELECT COUNT(*) AS c FROM assets').get().c;
  res.json({
    total,
    available: count('Available'),
    assigned: count('Assigned'),
    maintenance: count('Maintenance'),
    retired: count('Retired'),
  });
});

// ---------------- Assets ----------------
function cleanAsset(b) {
  const name = String(b.name || '').trim();
  const type = String(b.type || '').trim();
  const serial = String(b.serial_no || '').trim();
  const warranty = b.warranty_expiry ? String(b.warranty_expiry) : null;
  if (!name || !type || !serial) {
    return { error: 'Name, type and serial number are required' };
  }
  return { name, type, serial, warranty };
}

app.get('/api/assets', auth, adminOnly, (req, res) => {
  const { search = '', status = '' } = req.query;
  let sql = `
    SELECT a.*,
      (SELECT u.name FROM assignments s JOIN users u ON u.id = s.user_id
       WHERE s.asset_id = a.id AND s.returned_date IS NULL) AS assigned_to
    FROM assets a WHERE 1=1`;
  const params = [];
  if (search) {
    sql += ' AND (a.name LIKE ? OR a.serial_no LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    sql += ' AND a.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY a.id DESC';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/assets', auth, adminOnly, (req, res) => {
  const c = cleanAsset(req.body || {});
  if (c.error) return res.status(400).json({ error: c.error });
  if (db.prepare('SELECT id FROM assets WHERE serial_no = ?').get(c.serial)) {
    return res.status(409).json({ error: 'Serial number already exists' });
  }
  const r = db
    .prepare('INSERT INTO assets (name,type,serial_no,warranty_expiry) VALUES (?,?,?,?)')
    .run(c.name, c.type, c.serial, c.warranty);
  recordActivity(req.user, 'Asset added', 'asset', r.lastInsertRowid, `${c.name} (${c.serial})`);
  res.status(201).json(db.prepare('SELECT * FROM assets WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/assets/:id', auth, adminOnly, (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  const c = cleanAsset(req.body || {});
  if (c.error) return res.status(400).json({ error: c.error });
  if (db.prepare('SELECT id FROM assets WHERE serial_no = ? AND id != ?').get(c.serial, asset.id)) {
    return res.status(409).json({ error: 'Serial number already exists' });
  }
  db.prepare('UPDATE assets SET name=?, type=?, serial_no=?, warranty_expiry=? WHERE id=?')
    .run(c.name, c.type, c.serial, c.warranty, asset.id);
  recordActivity(req.user, 'Asset updated', 'asset', asset.id, `${asset.name} → ${c.name} (${c.serial})`);
  res.json(db.prepare('SELECT * FROM assets WHERE id = ?').get(asset.id));
});

// Retire / restore
app.patch('/api/assets/:id/status', auth, adminOnly, (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  const next = (req.body || {}).status;
  const ok =
    (asset.status === 'Available' && next === 'Retired') ||
    (asset.status === 'Retired' && next === 'Available');
  if (!ok) {
    return res.status(400).json({ error: `Cannot change status from ${asset.status} to ${next}` });
  }
  db.prepare('UPDATE assets SET status = ? WHERE id = ?').run(next, asset.id);
  recordActivity(req.user, next === 'Retired' ? 'Asset retired' : 'Asset restored', 'asset', asset.id, `${asset.name}: ${asset.status} → ${next}`);
  res.json({ message: 'Status updated' });
});

app.delete('/api/assets/:id', auth, adminOnly, (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  if (asset.status === 'Assigned' || asset.status === 'Maintenance') {
    return res.status(400).json({
      error: `Cannot delete an asset that is ${asset.status}. Return it / finish the repair first.`,
    });
  }
  db.transaction(() => {
    db.prepare('DELETE FROM repairs WHERE asset_id = ?').run(asset.id);
    db.prepare('DELETE FROM assignments WHERE asset_id = ?').run(asset.id);
    db.prepare('DELETE FROM assets WHERE id = ?').run(asset.id);
    recordActivity(req.user, 'Asset deleted', 'asset', asset.id, `${asset.name} (${asset.serial_no})`);
  })();
  res.json({ message: 'Asset deleted' });
});

// ---------------- Users (for the assign dropdown) ----------------
app.get('/api/users', auth, adminOnly, (req, res) => {
  res.json(
    db.prepare("SELECT id, name, email FROM users WHERE role = 'employee' ORDER BY name").all()
  );
});

app.post('/api/users', auth, adminOnly, (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
    return res.status(400).json({ error: 'Enter a name, valid email, and password with at least 6 characters' });
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const result = db.prepare('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)')
    .run(name, email, hash(password), 'employee');
  recordActivity(req.user, 'Employee added', 'user', result.lastInsertRowid, `${name} (${email})`);
  res.status(201).json({ id: result.lastInsertRowid, name, email, role: 'employee' });
});

// ---------------- Assignments ----------------
app.get('/api/assignments', auth, adminOnly, (req, res) => {
  res.json(
    db.prepare(`
      SELECT s.id, s.assigned_date, s.returned_date,
             a.name AS asset_name, a.serial_no, u.name AS employee_name
      FROM assignments s
      JOIN assets a ON a.id = s.asset_id
      JOIN users u ON u.id = s.user_id
      ORDER BY s.id DESC`).all()
  );
});

app.get('/api/activity', auth, adminOnly, (req, res) => {
  res.json(db.prepare(`SELECT id, actor_name, action, entity_type, entity_id, details, created_at
    FROM activity_log ORDER BY id DESC LIMIT 30`).all());
});

app.post('/api/assign', auth, adminOnly, (req, res) => {
  const body = req.body || {};
  const asset_id = Number(body.asset_id);
  const user_id = Number(body.user_id);
  if (!Number.isInteger(asset_id) || !Number.isInteger(user_id)) {
    return res.status(400).json({ error: 'Asset and employee are required' });
  }
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(asset_id);
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'employee'").get(user_id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  if (!user) return res.status(404).json({ error: 'Employee not found' });
  if (asset.status !== 'Available') {
    return res
      .status(400)
      .json({ error: `Asset is not available (current status: ${asset.status})` });
  }
  db.transaction(() => {
    const assignment = db.prepare('INSERT INTO assignments (asset_id,user_id,assigned_date) VALUES (?,?,?)')
      .run(asset_id, user_id, today());
    db.prepare("UPDATE assets SET status = 'Assigned' WHERE id = ?").run(asset_id);
    recordActivity(req.user, 'Asset assigned', 'assignment', assignment.lastInsertRowid, `${asset.name} (${asset.serial_no}) assigned to ${user.name}`);
  })();
  res.status(201).json({ message: 'Asset assigned' });
});

app.post('/api/return/:id', auth, adminOnly, (req, res) => {
  const a = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Assignment not found' });
  if (a.returned_date) return res.status(400).json({ error: 'Asset already returned' });
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(a.asset_id);
  if (asset.status === 'Maintenance') {
    return res.status(400).json({ error: 'Finish the repair before returning this asset' });
  }
  db.transaction(() => {
    db.prepare('UPDATE assignments SET returned_date = ? WHERE id = ?').run(today(), a.id);
    db.prepare("UPDATE assets SET status = 'Available' WHERE id = ?").run(a.asset_id);
    recordActivity(req.user, 'Asset returned', 'assignment', a.id, `${asset.name} (${asset.serial_no}) returned to inventory`);
  })();
  res.json({ message: 'Asset returned' });
});

// Assets of the logged-in employee
app.get('/api/my-assets', auth, (req, res) => {
  res.json(
    db.prepare(`
      SELECT a.id, a.name, a.type, a.serial_no, a.status, a.warranty_expiry, s.assigned_date
      FROM assignments s JOIN assets a ON a.id = s.asset_id
      WHERE s.user_id = ? AND s.returned_date IS NULL
      ORDER BY s.id DESC`).all(req.user.id)
  );
});

// ---------------- Repairs ----------------
const FLOW = ['Reported', 'In repair', 'Fixed'];
const PRIORITIES = ['High', 'Medium', 'Low'];

app.post('/api/repairs', auth, (req, res) => {
  const b = req.body || {};
  const asset_id = Number(b.asset_id);
  const issue = String(b.issue || '').trim();
  const priority = PRIORITIES.includes(b.priority) ? b.priority : 'Medium';
  if (!Number.isInteger(asset_id) || !issue) {
    return res.status(400).json({ error: 'Asset and issue description are required' });
  }
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(asset_id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  if (req.user.role !== 'admin') {
    const mine = db
      .prepare('SELECT id FROM assignments WHERE asset_id = ? AND user_id = ? AND returned_date IS NULL')
      .get(asset_id, req.user.id);
    if (!mine) {
      return res.status(403).json({ error: 'You can only report issues for your own assets' });
    }
  }
  if (asset.status === 'Retired') {
    return res.status(400).json({ error: 'This asset is retired' });
  }
  if (db.prepare("SELECT id FROM repairs WHERE asset_id = ? AND status != 'Fixed'").get(asset_id)) {
    return res.status(400).json({ error: 'A repair request is already open for this asset' });
  }

  let id;
  db.transaction(() => {
    const r = db
      .prepare('INSERT INTO repairs (asset_id, reported_by, issue, priority) VALUES (?,?,?,?)')
      .run(asset_id, req.user.id, issue, priority);
    id = r.lastInsertRowid;
    db.prepare("UPDATE assets SET status = 'Maintenance' WHERE id = ?").run(asset_id);
    recordActivity(req.user, 'Repair reported', 'repair', id, `${asset.name}: ${issue}`);
  })();
  res.status(201).json({ id, message: 'Repair request created' });
});

app.get('/api/repairs', auth, (req, res) => {
  const base = `
    SELECT r.*, a.name AS asset_name, a.serial_no, u.name AS reported_by_name
    FROM repairs r
    JOIN assets a ON a.id = r.asset_id
    JOIN users u ON u.id = r.reported_by`;
  if (req.user.role === 'admin') {
    return res.json(db.prepare(base + ' ORDER BY r.id DESC').all());
  }
  res.json(db.prepare(base + ' WHERE r.reported_by = ? ORDER BY r.id DESC').all(req.user.id));
});

app.patch('/api/repairs/:id', auth, adminOnly, (req, res) => {
  const r = db.prepare('SELECT * FROM repairs WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Repair request not found' });
  if (r.status === 'Fixed') return res.status(400).json({ error: 'Repair is already closed' });

  const next = (req.body || {}).status;
  const expected = FLOW[FLOW.indexOf(r.status) + 1];
  if (next !== expected) {
    return res
      .status(400)
      .json({ error: `Status must move from "${r.status}" to "${expected}"` });
  }

  db.transaction(() => {
    db.prepare('UPDATE repairs SET status = ? WHERE id = ?').run(next, r.id);
    recordActivity(req.user, 'Repair status updated', 'repair', r.id, `Request REQ-${r.id}: ${r.status} → ${next}`);
    if (next === 'Fixed') {
      const active = db
        .prepare('SELECT id FROM assignments WHERE asset_id = ? AND returned_date IS NULL')
        .get(r.asset_id);
      db.prepare('UPDATE assets SET status = ? WHERE id = ?')
        .run(active ? 'Assigned' : 'Available', r.asset_id);
    }
  })();
  res.json({ message: 'Status updated' });
});

// ---------------- Error handler ----------------
app.use((err, req, res, next) => {
  console.error(err.message);
  res
    .status(err.status || 500)
    .json({ error: err.status === 400 ? 'Invalid request body' : 'Server error' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`IT Asset Manager running at http://localhost:${PORT}`));
}

module.exports = app;