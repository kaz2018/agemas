// ブルートフォース対策: ログイン失敗回数をlocalStorageで管理
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15分

type AttemptRecord = {
  count: number;
  lockedUntil: number | null;
};

function getKey(loginKey: string) {
  return `login_attempts_${loginKey}`;
}

export function checkRateLimit(loginKey: string): {
  allowed: boolean;
  remainingMs?: number;
} {
  const raw = localStorage.getItem(getKey(loginKey));
  if (!raw) return { allowed: true };

  const record: AttemptRecord = JSON.parse(raw);

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return { allowed: false, remainingMs: record.lockedUntil - Date.now() };
  }

  return { allowed: true };
}

export function recordFailure(loginKey: string) {
  const raw = localStorage.getItem(getKey(loginKey));
  const record: AttemptRecord = raw
    ? JSON.parse(raw)
    : { count: 0, lockedUntil: null };

  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCK_DURATION_MS;
    record.count = 0;
  }

  localStorage.setItem(getKey(loginKey), JSON.stringify(record));
}

export function recordSuccess(loginKey: string) {
  localStorage.removeItem(getKey(loginKey));
}
