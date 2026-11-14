// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { verifySessionToken } from './session';

const SECRET = 'test-secret';
// Gerado com: URLSafeTimedSerializer('test-secret').dumps({user_id: 1, username: 'teste'})
const VALID = 'eyJ1c2VyX2lkIjoxLCJ1c2VybmFtZSI6InRlc3RlIn0.au6p_g.C-c5ORhT9mmVvOqh09Omx1z-Otk';

function issuedAt(token: string): number {
  const ts = token.split('.')[1];
  const b64 = ts.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (ts.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
}

describe('verifySessionToken', () => {
  const at = issuedAt(VALID) * 1000;

  it('aceita token assinado dentro da validade', async () => {
    expect(await verifySessionToken(VALID, SECRET, at + 1000)).toBe(true);
  });

  it('recusa token expirado (mais de 7 dias)', async () => {
    expect(await verifySessionToken(VALID, SECRET, at + 8 * 86400_000)).toBe(false);
  });

  it('recusa payload adulterado', async () => {
    const [payload, ts, sig] = VALID.split('.');
    expect(await verifySessionToken(`${payload.slice(0, -2)}AA.${ts}.${sig}`, SECRET, at + 1000)).toBe(false);
  });

  it('recusa segredo diferente e cookie inválido', async () => {
    expect(await verifySessionToken(VALID, 'outro-segredo', at + 1000)).toBe(false);
    expect(await verifySessionToken('x', SECRET, at)).toBe(false);
  });
});
