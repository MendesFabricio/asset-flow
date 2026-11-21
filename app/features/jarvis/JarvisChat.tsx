'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Brain, User, RefreshCw, ArrowRight, Loader2 } from 'lucide-react';
import { apiCall } from '@/lib/api';
import { Markdown } from '@/components/ui/Markdown';

interface Message {
  id: string;
  sender: 'user' | 'jarvis';
  text: string;
}

export function JarvisChat() {
  const [sessionId, setSessionId] = useState('session_1');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'jarvis',
      text: 'Olá! Sou o **Jarvis**, seu Assistente Quantitativo Pessoal. Tenho acesso completo em tempo real aos dados da sua carteira de investimentos, fluxo de caixa e atribuição de risco. \n\nComo posso ajudar você a otimizar sua alocação hoje?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sessionsList = [
    { id: 'session_1', label: 'Tópico Principal' },
    { id: 'session_2', label: 'Risco & Otimização' },
    { id: 'session_3', label: 'Dúvidas Gerais' }
  ];

  const suggestions = [
    'Qual meu patrimônio total hoje?',
    'Faça uma análise completa da minha carteira',
    'Analise o ativo MXRF11 separadamente',
    'Quais ativos estão abaixo da meta?',
    'Qual a minha exposição de risco?',
    'Resuma meus próximos recebíveis.',
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const fetchHistory = useCallback(() => {
    setLoading(true);
    apiCall<{ status: string; data?: Array<{ role: string; content: string; created_at?: string }> }>(`/api/ai/history?session_id=${sessionId}`)
      .then((res) => {
        if (res.status === 'Sucesso' && res.data) {
          const historyMsgs = res.data.map((msg, idx: number) => ({
            id: `db_${idx}_${msg.created_at}`,
            sender: (msg.role === 'user' ? 'user' : 'jarvis') as 'user' | 'jarvis',
            text: msg.content
          }));
          if (historyMsgs.length > 0) {
            setMessages(historyMsgs);
          } else {
            setMessages([
              {
                id: 'welcome',
                sender: 'jarvis',
                text: 'Olá! Sou o **Jarvis**, seu Assistente Quantitativo Pessoal. Tenho acesso completo em tempo real aos dados da sua carteira de investimentos, fluxo de caixa e atribuição de risco. \n\nComo posso ajudar você a otimizar sua alocação hoje?',
              },
            ]);
          }
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleClearHistory = () => {
    apiCall<{ status?: string }>(`/api/ai/history/clear`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId })
    })
      .then((res) => {
        if (res.status === 'Sucesso') {
          setMessages([
            {
              id: 'welcome',
              sender: 'jarvis',
              text: 'Olá! Sou o **Jarvis**, seu Assistente Quantitativo Pessoal. Tenho acesso completo em tempo real aos dados da sua carteira de investimentos, fluxo de caixa e atribuição de risco. \n\nComo posso ajudar você a otimizar sua alocação hoje?',
            },
          ]);
        }
      })
      .catch((err) => console.error(err));
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsgId = Date.now().toString();
    const userMsg: Message = { id: userMsgId, sender: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const jarvisMsgId = (Date.now() + 1).toString();
    const initialJarvisMsg: Message = { id: jarvisMsgId, sender: 'jarvis', text: '' };
    setMessages((prev) => [...prev, initialJarvisMsg]);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ message: text, session_id: sessionId }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Erro na requisição de IA.');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';

      setLoading(false);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          accumulatedText += chunk;
          
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === jarvisMsgId ? { ...msg, text: accumulatedText } : msg
            )
          );
        }
      }
    } catch (e) {
      clearTimeout(timeoutId);
      console.error(e);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === jarvisMsgId
            ? { ...msg, text: 'Ocorreu um erro ao conectar-se à inteligência artificial.' }
            : msg
        )
      );
      setLoading(false);
    }
  };



  return (
    <div className="max-w-4xl mx-auto bg-surface-card border border-border-subtle rounded-xl overflow-hidden shadow-sm flex flex-col h-[650px]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border-subtle bg-surface-elevated flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent-soft rounded-lg border border-accent/20 text-accent">
            <Brain size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
              Assistente Jarvis
              <span className="text-2xs uppercase font-semibold tracking-wider bg-accent-soft border border-accent/20 text-accent px-1.5 py-0.5 rounded-md">Jarvis Edition</span>
            </h3>
            <p className="text-2xs text-text-muted">Inteligência quantitativa consciente de portfólio</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            aria-label="Sessão do Assistente Jarvis"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            disabled={loading}
            className="bg-surface-input border border-border-subtle rounded-lg text-2xs font-semibold text-text-primary px-2 py-1 uppercase tracking-wider focus:outline-none focus:border-accent"
          >
            {sessionsList.map((s) => (
              <option key={s.id} value={s.id} className="bg-surface-card text-text-primary">
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleClearHistory}
            title="Limpar Conversa"
            className="text-text-muted hover:text-text-primary hover:bg-surface-card p-1.5 rounded-lg transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Message Thread */}
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-5 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 max-w-[85%] ${
              msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                msg.sender === 'user'
                  ? 'bg-surface-elevated border-border-subtle text-text-muted'
                  : 'bg-accent-soft border-accent/20 text-accent'
              }`}
            >
              {msg.sender === 'user' ? <User size={13} /> : <Brain size={13} />}
            </div>
            
            <div
              className={`p-3.5 rounded-xl text-xs leading-relaxed border ${
                msg.sender === 'user'
                  ? 'bg-accent-soft text-text-primary rounded-tr-none border-accent/20'
                  : 'bg-surface-elevated text-text-primary border-border-subtle rounded-tl-none'
              }`}
            >
              <Markdown text={msg.text} />
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 max-w-[85%] mr-auto">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border bg-accent-soft border-accent/20 text-accent">
              <Brain size={13} />
            </div>
            <div className="p-3.5 rounded-xl rounded-tl-none bg-surface-elevated text-text-muted border border-border-subtle flex items-center gap-2 text-xs">
              <Loader2 size={14} className="animate-spin text-accent" />
              <span>Analisando portfólio...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Pills */}
      {messages.length === 1 && (
        <div className="px-5 pb-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSend(s)}
              className="text-2xs font-medium bg-surface-elevated hover:bg-surface-input text-text-muted hover:text-text-primary border border-border-subtle rounded-lg px-3 py-1.5 transition-colors flex items-center gap-1 group"
            >
              <span>{s}</span>
              <ArrowRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" />
            </button>
          ))}
        </div>
      )}

      {/* Input Box */}
      <div className="p-4 border-t border-border-subtle bg-surface-elevated flex gap-2.5">
        <input
          type="text"
          placeholder="Pergunte ao Jarvis sobre sua carteira..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
          disabled={loading}
          className="flex-1 bg-surface-input border border-border-subtle rounded-lg px-4 py-2.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
        />
        <button
          onClick={() => handleSend(input)}
          disabled={loading || !input.trim()}
          className="p-2.5 bg-accent hover:bg-accent/90 disabled:bg-surface-input disabled:text-text-muted text-white rounded-lg transition-colors flex items-center justify-center border border-accent/20"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
