import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

function normalizeSecret(rawSecret) {
  const secret = rawSecret?.trim()
  if (!secret) {
    return crypto.createHash('sha256').update('pixel-roleplay-dev-secret').digest()
  }
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptSecret(text, rawSecret) {
  const value = String(text ?? '')
  if (!value) {
    return ''
  }

  const key = normalizeSecret(rawSecret)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(payload, rawSecret) {
  if (!payload) {
    return ''
  }

  const [ivHex, tagHex, encryptedHex] = payload.split(':')
  if (!ivHex || !tagHex || !encryptedHex) {
    return ''
  }

  const key = normalizeSecret(rawSecret)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

export function maskSecret(secret) {
  if (!secret) {
    return ''
  }
  const clean = secret.trim()
  if (clean.length <= 8) {
    return `${clean.slice(0, 2)}***${clean.slice(-1)}`
  }
  return `${clean.slice(0, 4)}***${clean.slice(-4)}`
}
