import { NextResponse } from 'next/server';
// Force Next.js rebuild
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:5328';

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

    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({
        success: false,
        message: 'Usuário e senha são obrigatórios.'
      }, { status: 400 });
    }

    // Chama o backend Flask para validar login
    const backendRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (backendRes.ok) {
      const data = await backendRes.json();
      const token = data.token;
      
      // Login com sucesso: limpa o histórico de erros do IP
      attemptsMap.delete(ip);

      const response = NextResponse.json({ 
        success: true,
        user: data.user
      });
      
      // Cria um cookie seguro que dura 7 dias contendo o token JWT assinado
      response.cookies.set('assetflow_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 dias
        path: '/',
      });

      return response;
    }

    // Trata falha retornada pelo backend Flask
    const errorData = await backendRes.json().catch(() => ({}));
    const errorMsg = errorData.msg || 'Credenciais inválidas.';

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
      : `${errorMsg} Você tem mais ${remaining} tentativa(s) antes do bloqueio.`;

    return NextResponse.json({ success: false, message: msg }, { status: backendRes.status });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Erro de conexão com o servidor.' }, { status: 500 });
  }
}
