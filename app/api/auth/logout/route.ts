import { NextResponse } from 'next/server';

function shouldUseSecureCookie(req: Request): boolean {
  return (
    process.env.COOKIE_SECURE === 'true' ||
    req.headers.get('x-forwarded-proto') === 'https'
  );
}

export async function POST(req: Request) {
  const response = NextResponse.json({ success: true, message: 'Deslogado com sucesso.' });

  // Limpa o cookie de sessão setando a data de expiração no passado
  response.cookies.set('assetflow_session', '', {
    httpOnly: true,
    secure: shouldUseSecureCookie(req),
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });

  return response;
}

export async function GET(req: Request) {
  const response = NextResponse.redirect(
    new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')
  );
  response.cookies.set('assetflow_session', '', {
    httpOnly: true,
    secure: shouldUseSecureCookie(req),
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });
  return response;
}
