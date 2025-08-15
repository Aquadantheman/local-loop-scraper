// src/utils/hash-generator.js - Generate unique hashes for event deduplication
import crypto from 'crypto';

export function generateHash(title, date, description, source) {
  const hashString = `${(title || '').trim()}-${(date || '').trim()}-${(source || '').trim()}-${(description || '').substring(0, 50).trim()}`;
  return crypto.createHash('md5').update(hashString).digest('hex');
}
