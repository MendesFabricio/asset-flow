'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Brain, Sparkles, User, RefreshCw, ArrowRight } from 'lucide-react';
import { apiCall } from '../utils/apiClient';

interface Message {
  id: string;
  sender: 'user' | 'jarvis';
  text: string;
}

export default function JarvisChat() {
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

  const suggestions = [
    'Qual meu patrimônio total hoje?',
    'Quais ativos estão abaixo da meta?',
    'Qual a minha exposição de risco?',
    'Resuma meus próximos recebíveis.',
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsgId = Date.now().toString();
    const userMsg: Message = { id: userMsgId, sender: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Adiciona uma mensagem vazia temporária para o Jarvis que será preenchida progressivamente
    const jarvisMsgId = (Date.now() + 1).toString();
    const initialJarvisMsg: Message = { id: jarvisMsgId, sender: 'jarvis', text: '' };
    setMessages((prev) => [...prev, initialJarvisMsg]);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5328';
      const response = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        throw new Error('Erro na requisição de IA.');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';

      setLoading(false); // Remove o indicador de carregamento, pois o streaming começou

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
      console.error(e);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === jarvisMsgId
            ? { ...msg, text: '❌ Ocorreu um erro ao conectar-se à inteligência local. Verifique se o serviço Ollama está ativo.' }
            : msg
        )
      );
      setLoading(false);
    }
  };

  // Renderizador simplificado de markdown para negrito, listas e parágrafos
  const renderMessageText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
      // Formata negrito **texto**
      let formatted = line;
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(line)) !== null) {
        // Adiciona texto normal anterior
        if (match.index > lastIndex) {
          parts.push(line.substring(lastIndex, match.index));
        }
        // Adiciona negrito
        parts.push(
          <strong key={match.index} className="text-white font-extrabold">
            {match[1]}
          </strong>
        );
        lastIndex = boldRegex.lastIndex;
      }
      if (lastIndex < line.length) {
        parts.push(line.substring(lastIndex));
      }

      const isListItem = line.trim().startsWith('-');
      const renderedLine = parts.length > 0 ? parts : formatted;

      if (isListItem) {
        return (
          <li key={lineIdx} className="ml-4 list-disc text-slate-300 pl-1 my-0.5">
            {typeof renderedLine === 'string' ? renderedLine.replace(/^-\s*/, '') : renderedLine}
          </li>
        );
      }

      return (
        <p key={lineIdx} className={lineIdx > 0 ? 'mt-2' : ''}>
          {renderedLine}
        </p>
      );
    });
  };

  return (
    <div className="max-w-4xl mx-auto bg-slate-950/40 border border-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[650px] backdrop-blur-md">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-900/60 bg-gradient-to-r from-slate-950 via-indigo-950/20 to-slate-950 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-indigo-400">
            <Brain size={18} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              Assistente Jarvis
              <span className="text-[9px] uppercase font-extrabold tracking-wider bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded">Jarvis Edition</span>
            </h3>
            <p className="text-[10px] text-slate-500">Inteligência quantitativa consciente de portfólio</p>
          </div>
        </div>
        <button
          onClick={() => setMessages((prev) => [prev[0]])}
          title="Limpar Conversa"
          className="text-slate-500 hover:text-slate-300 hover:bg-slate-900/50 p-1.5 rounded-lg transition-all"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Message Thread */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin scrollbar-thumb-slate-900">
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
                  ? 'bg-slate-900 border-slate-800 text-slate-400'
                  : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
              }`}
            >
              {msg.sender === 'user' ? <User size={13} /> : <Brain size={13} />}
            </div>
            
            <div
              className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-slate-900 text-slate-200 rounded-tr-none border border-slate-850'
                  : 'bg-indigo-950/20 text-slate-300 border border-indigo-500/10 shadow-[inset_0_1px_2px_rgba(99,102,241,0.03)] rounded-tl-none'
              }`}
            >
              {renderMessageText(msg.text)}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 max-w-[85%] mr-auto">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border bg-indigo-500/10 border-indigo-500/20 text-indigo-400">
              <Brain size={13} className="animate-pulse" />
            </div>
            <div className="p-3.5 rounded-2xl rounded-tl-none bg-indigo-950/10 text-slate-400 border border-indigo-500/5 shadow-inner flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
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
              className="text-[10px] font-semibold bg-slate-900 hover:bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-full px-3 py-1.5 transition-all flex items-center gap-1 group"
            >
              <span>{s}</span>
              <ArrowRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" />
            </button>
          ))}
        </div>
      )}

      {/* Input Box */}
      <div className="p-4 border-t border-slate-900/60 bg-slate-950/20 flex gap-2.5">
        <input
          type="text"
          placeholder="Pergunte ao Jarvis sobre sua carteira..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
          disabled={loading}
          className="flex-1 bg-slate-950/50 border border-slate-900 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
        />
        <button
          onClick={() => handleSend(input)}
          disabled={loading || !input.trim()}
          className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-900/50 disabled:text-slate-600 text-white rounded-xl transition-all shadow-lg hover:shadow-indigo-600/10 flex items-center justify-center border border-indigo-500/20"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
