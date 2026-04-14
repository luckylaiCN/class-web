import fs from "node:fs"
import path from "node:path"
import { createHash, randomBytes } from "node:crypto"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

let Database

try {
  Database = require("better-sqlite3")
} catch {
  Database = require("/opt/node_modules/better-sqlite3")
}

const MIGRATION_VERSION = 1
const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "data", "app.db")
const authFilePath = path.join(process.cwd(), ".auth")

function nowUnix() {
  return Math.floor(Date.now() / 1000)
}

function randomPassword() {
  return randomBytes(18).toString("base64url")
}

function randomHex(bytes) {
  return randomBytes(bytes).toString("hex")
}

function hashSha256(input) {
  return createHash("sha256").update(input).digest("hex")
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function initSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS class_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'inactive')),
      created_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      allow_multiple INTEGER NOT NULL,
      max_selections INTEGER,
      created_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(class_id) REFERENCES class_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS poll_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      option_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY(poll_id) REFERENCES polls(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(poll_id, user_id, option_id),
      FOREIGN KEY(poll_id) REFERENCES polls(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(option_id) REFERENCES poll_options(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(class_id) REFERENCES class_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS question_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      answer_text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(question_id, user_id),
      FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_class_sessions_status ON class_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_polls_class_id ON polls(class_id);
    CREATE INDEX IF NOT EXISTS idx_poll_options_poll_id ON poll_options(poll_id);
    CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_user ON poll_votes(poll_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_questions_class_id ON questions(class_id);
    CREATE INDEX IF NOT EXISTS idx_question_answers_q_u ON question_answers(question_id, user_id);
  `)
}

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `)
}

function ensureAdminAndAuthFile(db) {
  const admin = db
    .prepare("SELECT id, username FROM users WHERE role = 'admin' LIMIT 1")
    .get()

  const authExists = fs.existsSync(authFilePath)
  const needsSeed = !admin
  const needsRotate = !!admin && (admin.username !== "lucky" || !authExists)

  if (!needsSeed && !needsRotate) {
    return
  }

  const username = "lucky"
  const password = randomPassword()
  const salt = randomHex(16)
  const passwordHash = hashSha256(`${salt}:${password}`)

  if (admin) {
    db.prepare(
      `UPDATE users
       SET username = ?, password_hash = ?, password_salt = ?
       WHERE id = ?`
    ).run(username, passwordHash, salt, admin.id)
  } else {
    db.prepare(
      `INSERT INTO users (username, password_hash, password_salt, role, created_at)
       VALUES (?, ?, ?, 'admin', ?)`
    ).run(username, passwordHash, salt, nowUnix())
  }

  ensureDirectory(authFilePath)
  fs.writeFileSync(authFilePath, `ADMIN_USERNAME=${username}\nADMIN_PASSWORD=${password}\n`, {
    encoding: "utf8",
  })

  console.log(`[migrate] default admin credentials written to ${authFilePath}`)
  console.log(`[migrate] username=${username} password=${password}`)
}

function migrate() {
  ensureDirectory(dbPath)
  const db = new Database(dbPath)
  db.pragma("foreign_keys = ON")

  ensureMigrationTable(db)

  const applied = db
    .prepare("SELECT version FROM schema_migrations WHERE version = ? LIMIT 1")
    .get(MIGRATION_VERSION)

  if (!applied) {
    initSchema(db)
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      MIGRATION_VERSION,
      nowUnix()
    )
  }

  ensureAdminAndAuthFile(db)
}

migrate()
