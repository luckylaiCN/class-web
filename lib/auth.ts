import { createHash, randomBytes } from "node:crypto"

import { cookies } from "next/headers"

import {
  cleanupExpiredSessions,
  createSession,
  createUser,
  deleteSession,
  getSafeUserById,
  getSession,
  getUserByUsername,
  type SafeUser,
} from "@/lib/db"

const SESSION_COOKIE_NAME = "class_session"

export function hashPasswordWithSalt(password: string, salt = randomBytes(16).toString("hex")) {
  const passwordHash = createHash("sha256").update(`${salt}:${password}`).digest("hex")
  return { salt, passwordHash }
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actualHash = createHash("sha256").update(`${salt}:${password}`).digest("hex")
  return actualHash === expectedHash
}

function validateCredentialInput(username: string, password: string) {
  if (!username || username.trim().length < 3) {
    throw new Error("用户名至少 3 个字符")
  }
  if (!password || password.length < 6) {
    throw new Error("密码至少 6 个字符")
  }
}

export function registerUser(username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase()
  validateCredentialInput(normalizedUsername, password)

  const existed = getUserByUsername(normalizedUsername)
  if (existed) {
    throw new Error("用户名已存在")
  }

  const { salt, passwordHash } = hashPasswordWithSalt(password)
  return createUser(normalizedUsername, passwordHash, salt)
}

export function loginUser(username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase()
  validateCredentialInput(normalizedUsername, password)

  const user = getUserByUsername(normalizedUsername)
  if (!user) {
    throw new Error("用户名或密码错误")
  }

  const valid = verifyPassword(password, user.password_salt, user.password_hash)
  if (!valid) {
    throw new Error("用户名或密码错误")
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
  }
}

export async function createUserSession(userId: number) {
  cleanupExpiredSessions()

  const token = randomBytes(32).toString("hex")
  const expiresAt = createSession(userId, token)

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt * 1000),
    path: "/",
  })
}

export async function clearUserSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (token) {
    deleteSession(token)
  }
  cookieStore.delete(SESSION_COOKIE_NAME)
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  cleanupExpiredSessions()

  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) {
    return null
  }

  const session = getSession(token)
  if (!session || session.expires_at <= Math.floor(Date.now() / 1000)) {
    cookieStore.delete(SESSION_COOKIE_NAME)
    if (session) {
      deleteSession(token)
    }
    return null
  }

  const user = getSafeUserById(session.user_id)
  if (!user) {
    cookieStore.delete(SESSION_COOKIE_NAME)
    deleteSession(token)
    return null
  }

  return user
}
