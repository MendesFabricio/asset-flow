'use client';
import React from 'react';

interface MarkdownProps {
  text: any;
}

export function Markdown({ text }: MarkdownProps) {
  if (!text) return null;
  
  let cleanText = '';
  if (typeof text === 'string') {
    cleanText = text;
  } else if (Array.isArray(text)) {
    cleanText = text.join('\n');
  } else if (typeof text === 'object') {
    try {
      cleanText = JSON.stringify(text, null, 2);
    } catch {
      cleanText = String(text);
    }
  } else {
    cleanText = String(text);
  }

  const lines = cleanText.split('\n');

  const renderInlineBold = (lineText: string) => {
    const boldRegex = /\*\*(.*?)\*\*/g;
    const parts: (string | React.ReactNode)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = boldRegex.exec(lineText)) !== null) {
      if (match.index > lastIndex) {
        parts.push(lineText.substring(lastIndex, match.index));
      }
      parts.push(
        <strong key={match.index} className="text-white font-extrabold">
          {match[1]}
        </strong>
      );
      lastIndex = boldRegex.lastIndex;
    }
    if (lastIndex < lineText.length) {
      parts.push(lineText.substring(lastIndex));
    }
    return parts.length > 0 ? parts : lineText;
  };

  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;

        // Headers: ###, ##, #
        if (trimmed.startsWith('#')) {
          const depth = (trimmed.match(/^#+/) || ['#'])[0].length;
          const cleanText = trimmed.replace(/^#+\s*/, '');
          const boldText = renderInlineBold(cleanText);

          if (depth === 1) {
            return (
              <h1 key={idx} className="text-sm font-black text-white mt-4 mb-2 uppercase tracking-wide border-b border-slate-800 pb-1">
                {boldText}
              </h1>
            );
          }
          if (depth === 2) {
            return (
              <h2 key={idx} className="text-xs font-black text-slate-100 mt-3 mb-1.5 uppercase tracking-wide">
                {boldText}
              </h2>
            );
          }
          return (
            <h3 key={idx} className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2 mb-1">
              {boldText}
            </h3>
          );
        }

        // List item (starts with '-' or '*')
        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
          const cleanText = trimmed.replace(/^[-*]\s*/, '');
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1.5 my-0.5">
              <span className="text-indigo-400 select-none text-[10px] mt-0.5">•</span>
              <p className="text-xs text-slate-300 leading-relaxed flex-1">
                {renderInlineBold(cleanText)}
              </p>
            </div>
          );
        }

        // Standard Paragraph
        return (
          <p key={idx} className="text-xs text-slate-300 leading-relaxed">
            {renderInlineBold(line)}
          </p>
        );
      })}
    </div>
  );
}
