import fs from "node:fs"
import path from "node:path"
import { createHash, randomBytes } from "node:crypto"

import Database from "better-sqlite3"

export type UserRole = "admin" | "user"
export type ClassStatus = "active" | "inactive"

export type SafeUser = {
  id: number
  username: string
  role: UserRole
}

export type AdminCredentials = {
  username: string
  password: string
}

type DbUserRow = SafeUser & {
  password_hash: string
  password_salt: string
}

type SessionRow = {
  id: string
  user_id: number
  expires_at: number
}

type MigrationRecord = {
  version: number
}

const DB_MIGRATION_VERSION = 1
const AUTH_FILE_PATH = path.join(process.cwd(), ".auth")

let dbSingleton: Database.Database | null = null

function getDbPath() {
  const configured = process.env.SQLITE_DB_PATH
  if (configured && configured.trim().length > 0) {
    return configured
  }
  return path.join(process.cwd(), "data", "app.db")
}

function nowUnix() {
  return Math.floor(Date.now() / 1000)
}

function generateAdminPassword() {
  return randomBytes(18).toString("base64url")
}

function hashSha256(input: string) {
  return createHash("sha256").update(input).digest("hex")
}

function randomHex(bytes: number) {
  return randomBytes(bytes).toString("hex")
}

function initSchema(db: Database.Database) {
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

function ensureMigrationStateTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `)
}

function writeAuthFile(credentials: AdminCredentials) {
  const fileContent = [
    `ADMIN_USERNAME=${credentials.username}`,
    `ADMIN_PASSWORD=${credentials.password}`,
    "",
  ].join("\n")

  fs.writeFileSync(AUTH_FILE_PATH, fileContent, { encoding: "utf8" })
}

function seedOrRotateDefaultAdmin(db: Database.Database) {
  const admin = db
    .prepare("SELECT id, username FROM users WHERE role = 'admin' LIMIT 1")
    .get() as { id: number; username: string } | undefined

  const shouldRotateCredentials = !admin || admin.username !== "lucky" || !fs.existsSync(AUTH_FILE_PATH)

  if (!shouldRotateCredentials) {
    return
  }

  const credentials: AdminCredentials = {
    username: "lucky",
    password: generateAdminPassword(),
  }
  const salt = randomHex(16)
  const passwordHash = hashSha256(`${salt}:${credentials.password}`)

  if (admin) {
    db.prepare(
      `UPDATE users
       SET username = ?, password_hash = ?, password_salt = ?
       WHERE id = ?`
    ).run(credentials.username, passwordHash, salt, admin.id)
  } else {
    db.prepare(
      `INSERT INTO users (username, password_hash, password_salt, role, created_at)
       VALUES (?, ?, ?, 'admin', ?)`
    ).run(credentials.username, passwordHash, salt, nowUnix())
  }

  writeAuthFile(credentials)
  console.log(`[migrate] default admin credentials written to ${AUTH_FILE_PATH}`)
  console.log(`[migrate] username=${credentials.username} password=${credentials.password}`)
}

export function migrate(db: Database.Database) {
  ensureMigrationStateTable(db)

  const applied = db
    .prepare("SELECT version FROM schema_migrations WHERE version = ? LIMIT 1")
    .get(DB_MIGRATION_VERSION) as MigrationRecord | undefined

  if (!applied) {
    initSchema(db)
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      DB_MIGRATION_VERSION,
      nowUnix()
    )
  }

  seedOrRotateDefaultAdmin(db)
}

export function getDb() {
  if (dbSingleton) {
    return dbSingleton
  }

  const dbPath = getDbPath()
  const parentDir = path.dirname(dbPath)
  fs.mkdirSync(parentDir, { recursive: true })

  const db = new Database(dbPath)
  db.pragma("foreign_keys = ON")

  migrate(db)

  dbSingleton = db
  return dbSingleton
}

export function getUserByUsername(username: string) {
  const db = getDb()
  return db
    .prepare(
      `SELECT id, username, role, password_hash, password_salt
       FROM users
       WHERE username = ?
       LIMIT 1`
    )
    .get(username) as DbUserRow | undefined
}

export function createUser(username: string, passwordHash: string, passwordSalt: string) {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO users (username, password_hash, password_salt, role, created_at)
       VALUES (?, ?, ?, 'user', ?)`
    )
    .run(username, passwordHash, passwordSalt, nowUnix())

  return {
    id: Number(result.lastInsertRowid),
    username,
    role: "user" as UserRole,
  }
}

export function createSession(userId: number, token: string, ttlSeconds = 60 * 60 * 24 * 7) {
  const db = getDb()
  const expiresAt = nowUnix() + ttlSeconds
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expiresAt)
  return expiresAt
}

export function deleteSession(token: string) {
  const db = getDb()
  db.prepare("DELETE FROM sessions WHERE id = ?").run(token)
}

export function getSession(token: string) {
  const db = getDb()
  return db
    .prepare("SELECT id, user_id, expires_at FROM sessions WHERE id = ? LIMIT 1")
    .get(token) as SessionRow | undefined
}

export function cleanupExpiredSessions() {
  const db = getDb()
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowUnix())
}

export function getSafeUserById(userId: number) {
  const db = getDb()
  return db
    .prepare("SELECT id, username, role FROM users WHERE id = ? LIMIT 1")
    .get(userId) as SafeUser | undefined
}

export function listClasses(role: UserRole) {
  const db = getDb()
  const base = `
    SELECT c.id, c.title, c.status, c.created_at, u.username AS created_by
    FROM class_sessions c
    JOIN users u ON u.id = c.created_by
  `
  const rows =
    role === "admin"
      ? db.prepare(`${base} ORDER BY c.created_at DESC`).all()
      : db
          .prepare(`${base} WHERE c.status = 'active' ORDER BY c.created_at DESC`)
          .all()

  return rows as Array<{
    id: number
    title: string
    status: ClassStatus
    created_at: number
    created_by: string
  }>
}

export function createClassSession(title: string, createdBy: number) {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO class_sessions (title, status, created_by, created_at)
       VALUES (?, 'inactive', ?, ?)`
    )
    .run(title, createdBy, nowUnix())
  return Number(result.lastInsertRowid)
}

export function setClassStatus(classId: number, status: ClassStatus) {
  const db = getDb()
  db.prepare("UPDATE class_sessions SET status = ? WHERE id = ?").run(status, classId)
}

export function deleteClassSession(classId: number) {
  const db = getDb()
  db.prepare("DELETE FROM class_sessions WHERE id = ?").run(classId)
}

export function getClassById(classId: number) {
  const db = getDb()
  return db
    .prepare(
      `SELECT c.id, c.title, c.status, c.created_at, u.username AS created_by
       FROM class_sessions c
       JOIN users u ON u.id = c.created_by
       WHERE c.id = ?
       LIMIT 1`
    )
    .get(classId) as
    | {
        id: number
        title: string
        status: ClassStatus
        created_at: number
        created_by: string
      }
    | undefined
}

export function createPoll(input: {
  classId: number
  title: string
  allowMultiple: boolean
  maxSelections: number | null
  createdBy: number
  options: string[]
}) {
  const db = getDb()
  const txn = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO polls (class_id, title, allow_multiple, max_selections, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.classId,
        input.title,
        input.allowMultiple ? 1 : 0,
        input.maxSelections,
        input.createdBy,
        nowUnix()
      )

    const pollId = Number(result.lastInsertRowid)
    const optionStmt = db.prepare(
      "INSERT INTO poll_options (poll_id, option_text, sort_order) VALUES (?, ?, ?)"
    )

    input.options.forEach((option, index) => {
      optionStmt.run(pollId, option, index)
    })

    return pollId
  })

  return txn()
}

export function createQuestion(input: { classId: number; title: string; createdBy: number }) {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO questions (class_id, title, created_by, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(input.classId, input.title, input.createdBy, nowUnix())
  return Number(result.lastInsertRowid)
}

export function submitVote(input: { pollId: number; userId: number; optionIds: number[] }) {
  const db = getDb()

  const poll = db
    .prepare(
      `SELECT id, allow_multiple, max_selections
       FROM polls
       WHERE id = ?
       LIMIT 1`
    )
    .get(input.pollId) as
    | {
        id: number
        allow_multiple: number
        max_selections: number | null
      }
    | undefined

  if (!poll) {
    throw new Error("投票不存在")
  }

  const uniqueOptionIds = [...new Set(input.optionIds)]
  if (uniqueOptionIds.length === 0) {
    throw new Error("请至少选择一个选项")
  }

  if (!poll.allow_multiple && uniqueOptionIds.length !== 1) {
    throw new Error("单选投票只能选择一个选项")
  }

  if (poll.max_selections && uniqueOptionIds.length > poll.max_selections) {
    throw new Error(`最多只能选择 ${poll.max_selections} 个选项`)
  }

  const allowedOptions = db
    .prepare("SELECT id FROM poll_options WHERE poll_id = ?")
    .all(input.pollId) as Array<{ id: number }>
  const allowedSet = new Set(allowedOptions.map((x) => x.id))

  if (!uniqueOptionIds.every((id) => allowedSet.has(id))) {
    throw new Error("包含无效投票选项")
  }

  const existing = db
    .prepare("SELECT id FROM poll_votes WHERE poll_id = ? AND user_id = ? LIMIT 1")
    .get(input.pollId, input.userId) as { id: number } | undefined

  if (existing) {
    throw new Error("你已经提交过该投票")
  }

  const txn = db.transaction(() => {
    const stmt = db.prepare(
      `INSERT INTO poll_votes (poll_id, user_id, option_id, created_at)
       VALUES (?, ?, ?, ?)`
    )
    uniqueOptionIds.forEach((optionId) => {
      stmt.run(input.pollId, input.userId, optionId, nowUnix())
    })
  })

  txn()
}

export function submitQuestionAnswer(input: { questionId: number; userId: number; answerText: string }) {
  const db = getDb()
  const existed = db
    .prepare("SELECT id FROM question_answers WHERE question_id = ? AND user_id = ? LIMIT 1")
    .get(input.questionId, input.userId) as { id: number } | undefined

  if (existed) {
    db.prepare(
      `UPDATE question_answers
       SET answer_text = ?, created_at = ?
       WHERE id = ?`
    ).run(input.answerText, nowUnix(), existed.id)
    return
  }

  db.prepare(
    `INSERT INTO question_answers (question_id, user_id, answer_text, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(input.questionId, input.userId, input.answerText, nowUnix())
}

export function getClassRoomData(classId: number, userId: number) {
  const db = getDb()
  const classSession = getClassById(classId)

  if (!classSession) {
    return null
  }

  const polls = db
    .prepare(
      `SELECT p.id, p.title, p.allow_multiple, p.max_selections, p.created_at,
              EXISTS(
                SELECT 1 FROM poll_votes pv
                WHERE pv.poll_id = p.id AND pv.user_id = ?
              ) AS has_voted
       FROM polls p
       WHERE p.class_id = ?
       ORDER BY p.created_at DESC`
    )
    .all(userId, classId) as Array<{
    id: number
    title: string
    allow_multiple: number
    max_selections: number | null
    created_at: number
    has_voted: number
  }>

  const pollOptionsStmt = db.prepare(
    `SELECT o.id, o.option_text,
            COUNT(v.id) AS vote_count
     FROM poll_options o
     LEFT JOIN poll_votes v ON v.option_id = o.id
     WHERE o.poll_id = ?
     GROUP BY o.id, o.option_text
     ORDER BY o.sort_order ASC`
  )

  const questions = db
    .prepare(
      `SELECT q.id, q.title, q.created_at,
              EXISTS(
                SELECT 1 FROM question_answers qa
                WHERE qa.question_id = q.id AND qa.user_id = ?
              ) AS has_answered,
              (
                SELECT qa2.answer_text
                FROM question_answers qa2
                WHERE qa2.question_id = q.id AND qa2.user_id = ?
                LIMIT 1
              ) AS my_answer,
              (
                SELECT COUNT(1)
                FROM question_answers qa3
                WHERE qa3.question_id = q.id
              ) AS answer_count
       FROM questions q
       WHERE q.class_id = ?
       ORDER BY q.created_at DESC`
    )
    .all(userId, userId, classId) as Array<{
    id: number
    title: string
    created_at: number
    has_answered: number
    my_answer: string | null
    answer_count: number
  }>

  const answersStmt = db.prepare(
    `SELECT qa.answer_text, qa.created_at, u.username
     FROM question_answers qa
     JOIN users u ON u.id = qa.user_id
     WHERE qa.question_id = ?
     ORDER BY qa.created_at DESC`
  )

  const pollView = polls.map((poll) => ({
    id: poll.id,
    title: poll.title,
    createdAt: poll.created_at,
    allowMultiple: !!poll.allow_multiple,
    maxSelections: poll.max_selections,
    hasVoted: !!poll.has_voted,
    options: pollOptionsStmt.all(poll.id) as Array<{
      id: number
      option_text: string
      vote_count: number
    }>,
  }))

  const questionView = questions.map((q) => ({
    id: q.id,
    title: q.title,
    createdAt: q.created_at,
    hasAnswered: !!q.has_answered,
    myAnswer: q.my_answer,
    answerCount: q.answer_count,
    answers: answersStmt.all(q.id) as Array<{
      answer_text: string
      created_at: number
      username: string
    }>,
  }))

  const panel = {
    totalPolls: pollView.length,
    totalQuestions: questionView.length,
    totalVotes: pollView.reduce(
      (sum, poll) => sum + poll.options.reduce((s, option) => s + option.vote_count, 0),
      0
    ),
    totalAnswers: questionView.reduce((sum, question) => sum + question.answerCount, 0),
  }

  return {
    classSession,
    polls: pollView,
    questions: questionView,
    panel,
  }
}
