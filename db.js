const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const file = process.env.DB_FILE || path.join(__dirname, 'itam.db');
const db = new Database(file);
db.pragma('foreign_keys = ON');

const hash = (p) => crypto.createHash('sha256').update(String(p)).digest('hex');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','employee'))
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  serial_no TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Available'
    CHECK (status IN ('Available','Assigned','Maintenance','Retired')),
  warranty_expiry TEXT
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  assigned_date TEXT NOT NULL,
  returned_date TEXT
);

CREATE TABLE IF NOT EXISTS repairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id),
  reported_by INTEGER NOT NULL REFERENCES users(id),
  issue TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High','Medium','Low')),
  status TEXT NOT NULL DEFAULT 'Reported' CHECK (status IN ('Reported','In repair','Fixed')),
  created_at TEXT NOT NULL DEFAULT (date('now'))
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---------- Seed data (runs only on an empty database) ----------
if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0) {
  const addUser = db.prepare('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)');
  const addAsset = db.prepare(
    'INSERT INTO assets (name,type,serial_no,status,warranty_expiry) VALUES (?,?,?,?,?)'
  );
  const addAssign = db.prepare(
    'INSERT INTO assignments (asset_id,user_id,assigned_date) VALUES (?,?,?)'
  );

  db.transaction(() => {
    addUser.run('Admin User', 'admin@itam.com', hash('admin123'), 'admin');        // id 1
    addUser.run('Rishabh Kumar', 'rishabh@itam.com', hash('emp123'), 'employee');  // id 2
    addUser.run('Ayush Raj', 'ayush@itam.com', hash('emp123'), 'employee');        // id 3
    addUser.run('Mayank Bisht', 'mayank@itam.com', hash('emp123'), 'employee');    // id 4
    addUser.run('Neha Sharma', 'neha@itam.com', hash('emp123'), 'employee');       // id 5

    addAsset.run('Dell Latitude 5440', 'Laptop', 'DL-48213', 'Assigned', '2028-03-12');   // id 1
    addAsset.run('LG 24 inch monitor', 'Monitor', 'LG-77120', 'Available', '2026-12-12'); // id 2
    addAsset.run('HP EliteBook 840', 'Laptop', 'HP-30981', 'Assigned', '2026-11-25');     // id 3
    addAsset.run('Office 365 license', 'Software', 'LIC-5521', 'Available', '2027-06-12');  // id 4
    addAsset.run('Logitech K120', 'Keyboard', 'LT-90412', 'Retired', null);               // id 5
    addAsset.run('Cisco 2960 switch', 'Network', 'CS-11902', 'Available', '2029-08-12');  // id 6
    addAsset.run('Lenovo ThinkPad E14', 'Laptop', 'LN-66210', 'Available', '2028-01-12'); // id 7
    addAsset.run('Dell P2422H monitor', 'Monitor', 'DM-20334', 'Available', '2027-09-12'); // id 8

    addAssign.run(1, 2, '2025-04-12'); // Dell Latitude -> Rishabh
    addAssign.run(3, 3, '2025-06-03'); // HP EliteBook  -> Ayush
  })();
}

module.exports = { db, hash };