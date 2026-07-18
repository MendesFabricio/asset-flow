import { NextRequest, NextResponse } from 'next/server';

// Force Next.js rebuild
export const dynamic = 'force-dynamic';

// Proxy de streaming para o Jarvis (Ollama function-calling no backend Flask).
// O rewrite genérico de /api/* NÃO repassa respostas chunked, por isso este
// Route Handler faz o proxy manual do stream (mesmo padrão de /api/sync/stream).
export async function POST(request: NextRequest) {
  const backendUrl = (process.env.BACKEND_URL || 'http://backend:5328') + '/api/ai/chat';

  try {
    const body = await request.text();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const cookie = request.headers.get('cookie');
    if (cookie) headers['Cookie'] = cookie;

    const backendRes = await fetch(backendUrl, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
      // @ts-expect-error Node 18+ suporta duplex para requisições com body
      duplex: 'half',
    });

    if (!backendRes.body) {
      return new NextResponse('No response body from backend stream', { status: 500 });
    }

    const reader = backendRes.body.getReader();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            controller.enqueue(value);
          }
        } catch (err) {
          controller.error(err);
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return new NextResponse(stream, {
      status: backendRes.status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('❌ [Next.js Route] Erro ao fazer proxy do stream do Jarvis:', error);
    return new NextResponse('Error connecting to backend stream', { status: 502 });
  }
}
