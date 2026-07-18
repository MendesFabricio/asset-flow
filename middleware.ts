import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('assetflow_session')?.value;
  const { pathname } = request.nextUrl;

  // 1. Permite acesso livre para rotas públicas e recursos estáticos
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health') ||
    pathname === '/api/sync/stream' ||
    pathname === '/api/ai/chat' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    // Se já estiver logado e tentar ir para o login, redireciona para a home
    if (token && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // 2. Se não estiver logado
  if (!token) {
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
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Executa o middleware em todas as rotas que não sejam recursos estáticos
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
