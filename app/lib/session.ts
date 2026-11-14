// Valida o cookie de sessão do Flask (itsdangerous URLSafeTimedSerializer) sem
// chamar o backend. Formato: base64url(json).base64url(timestamp).base64url(hmac-sha1)
const SALT = 'itsdangerous'; // sal padrão do Serializer do itsdangerous
const MAX_AGE = 604800; // 7 dias, igual a verify_session_token no Flask

// shortcut: sem SECRET_KEY o frontend usa a chave padrão de dev do backend
// (server/backend.py); defina SECRET_KEY no frontend em qualquer deploy real.
const DEV_SECRET = 'asset_flow_dev_secret_key_default_value_change_in_prod';

function b64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array<ArrayBuffer>): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSha1(key: Uint8Array<ArrayBuffer>, message: string): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message)));
}

export async function verifySessionToken(
  token: string,
  secret: string = process.env.SECRET_KEY || DEV_SECRET,
  now: number = Date.now()
): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [payload, timestamp, signature] = parts;

  // Derivação de chave django-concat, o padrão do itsdangerous.
  const key = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${SALT}signer${secret}`)));
  const expected = bytesToB64url(await hmacSha1(key, `${payload}.${timestamp}`));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return false;

  const tsBytes = b64urlToBytes(timestamp);
  if (tsBytes.length !== 4) return false;
  const issuedAt = ((tsBytes[0] << 24) | (tsBytes[1] << 16) | (tsBytes[2] << 8) | tsBytes[3]) >>> 0;
  const age = now / 1000 - issuedAt;
  return age >= -60 && age <= MAX_AGE; // 60s de folga para relógios desalinhados
}
