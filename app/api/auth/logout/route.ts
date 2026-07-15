import { NextResponse } from 'next/server';

export async function POST() {
  console.log("LOGOUT ROUTE HIT!");
  const response = NextResponse.json({ success: true, message: 'Deslogado com sucesso.' });
  
  // Limpa o cookie de sessão setando a data de expiração no passado
  response.cookies.set('assetflow_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });

  return response;
}
export async function GET() {
  const response = NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
  response.cookies.set('assetflow_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });
  return response;
}
