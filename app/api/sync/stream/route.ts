import { NextRequest, NextResponse } from 'next/server';

// Force Next.js rebuild
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const backendUrl = 'http://backend:5328/api/sync/stream';
  
  try {
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
      },
      cache: 'no-store',
    });

    if (!response.body) {
      return new Response('No response body from backend stream', { status: 500 });
    }

    const reader = response.body.getReader();

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
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('❌ [Next.js Route] Erro ao fazer proxy da stream SSE:', error);
    return new Response('Error connecting to backend stream', { status: 502 });
  }
}
