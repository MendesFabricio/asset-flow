import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:5328';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({
        success: false,
        message: 'Usuário e senha são obrigatórios.'
      }, { status: 400 });
    }

    const backendRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (backendRes.ok) {
      const data = await backendRes.json();
      return NextResponse.json({
        success: true,
        message: data.msg || 'Conta criada com sucesso!'
      });
    }

    const errorData = await backendRes.json().catch(() => ({}));
    const errorMsg = errorData.msg || 'Falha ao registrar usuário.';

    return NextResponse.json({
      success: false,
      message: errorMsg
    }, { status: backendRes.status });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Erro ao conectar-se com o servidor do backend.'
    }, { status: 500 });
  }
}
