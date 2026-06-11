export type FailedAttempts = Map<string, { count: number; resetAt: number }>

export function clientIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || headers.get('x-real-ip') || 'unknown'
}

export function isBlocked(attempts: FailedAttempts, ip: string, maxFailures: number): boolean {
  const attempt = attempts.get(ip)
  if (!attempt) {
    return false
  }
  if (Date.now() >= attempt.resetAt) {
    attempts.delete(ip)
    return false
  }
  return attempt.count >= maxFailures
}

export function incrementFailure(attempts: FailedAttempts, ip: string, windowMs: number): void {
  const now = Date.now()
  const attempt = attempts.get(ip)
  if (!attempt || now >= attempt.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + windowMs })
    return
  }
  attempt.count += 1
}

export function resetFailures(attempts: FailedAttempts, ip: string): void {
  attempts.delete(ip)
}
