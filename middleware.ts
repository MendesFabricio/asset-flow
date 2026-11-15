import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from './app/lib/session';

// Rotas públicas: login, auth e os proxies que o backend já protege.
const PUBLIC_PREFIXES = ['/login', '/api/auth', '/api/health', '/api/sync/stream', '/api/ai/chat', '/_next'];
const isPublic = (pathname: string) =>
  PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
  pathname === '/favicon.ico' ||
  pathname === '/icon.svg';

function deny(request: NextRequest, pathname: string) {
  // Se for rota de API, retorna 401 JSON em vez de redirect HTML
  if (pathname.startsWith('/api/')) {
    return new NextResponse(
      JSON.stringify({ status: 'Erro', message: 'Sessão expirada ou não autorizada.' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Redireciona páginas normais para a tela de login
  const loginUrl = new URL('/login', request.url);
  // Preserva a página que o usuário tentou acessar antes
  if (pathname !== '/') {
    loginUrl.searchParams.set('callbackUrl', pathname);
  }
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete('assetflow_session');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('assetflow_session')?.value;
  // Existir não basta: valida assinatura e validade do token emitido pelo Flask.
  const authenticated = token ? await verifySessionToken(token) : false;

  if (isPublic(pathname)) {
    // Se já estiver logado e tentar ir para o login, redireciona para a home
    if (authenticated && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  return authenticated ? NextResponse.next() : deny(request, pathname);
}

export const config = {
  // Executa o middleware em todas as rotas que não sejam recursos estáticos
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
