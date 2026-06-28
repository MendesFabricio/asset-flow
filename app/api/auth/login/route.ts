import { NextResponse } from 'next/server';

// 🔒 Rate Limiting em memória por IP
interface RateLimitRecord {
  attempts: number;
  lockoutUntil: number;
}
const attemptsMap = new Map<string, RateLimitRecord>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutos de bloqueio

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown-ip';
    const now = Date.now();

    // ⏳ Verificação de bloqueio ativo
    const record = attemptsMap.get(ip);
    if (record && record.attempts >= MAX_ATTEMPTS) {
      if (now < record.lockoutUntil) {
        const remainingMin = Math.ceil((record.lockoutUntil - now) / 60000);
        return NextResponse.json({
          success: false,
          message: `Muitas tentativas falhas. IP bloqueado temporariamente por mais ${remainingMin} minuto(s).`
        }, { status: 429 });
      } else {
        // Expiração do bloqueio, limpa registro
        attemptsMap.delete(ip);
      }
    }

    const { password } = await req.json();
    const validPass = process.env.BASIC_AUTH_PASSWORD;

    // 🛡️ Segurança estrita: impede boot ou login se a senha de produção estiver ausente
    if (!validPass) {
      return NextResponse.json({
        success: false,
        message: 'Acesso indisponível: BASIC_AUTH_PASSWORD não configurada no servidor.'
      }, { status: 500 });
    }

    if (password === validPass) {
      // Login com sucesso: limpa o histórico de erros do IP
      attemptsMap.delete(ip);

      const response = NextResponse.json({ success: true });
      
      // Cria um cookie seguro que dura 7 dias
      response.cookies.set('assetflow_session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7, // 7 dias
        path: '/',
      });

      return response;
    }

    // ❌ Falha de login: incrementa contador de tentativas
    const failRecord = attemptsMap.get(ip) || { attempts: 0, lockoutUntil: 0 };
    failRecord.attempts += 1;
    if (failRecord.attempts >= MAX_ATTEMPTS) {
      failRecord.lockoutUntil = now + LOCKOUT_DURATION;
    }
    attemptsMap.set(ip, failRecord);

    const remaining = MAX_ATTEMPTS - failRecord.attempts;
    const msg = failRecord.attempts >= MAX_ATTEMPTS
      ? 'Muitas tentativas falhas. Seu IP foi bloqueado por 15 minutos.'
      : `Senha incorreta. Você tem mais ${remaining} tentativa(s) antes do bloqueio.`;

    return NextResponse.json({ success: false, message: msg }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
