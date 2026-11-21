'use client';
import React from 'react';

interface MarkdownProps {
  text: unknown;
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

  const renderInlineFormatting = (lineText: string): React.ReactNode[] | string => {
    let parts: (string | React.ReactNode)[] = [lineText];
    
    const applyRegex = (
      regex: RegExp, 
      replacer: (match: string[], key: string) => React.ReactNode
    ) => {
      const newParts: (string | React.ReactNode)[] = [];
      parts.forEach((part, pIdx) => {
        if (typeof part !== 'string') {
          newParts.push(part);
          return;
        }
        
        let lastIndex = 0;
        let match;
        regex.lastIndex = 0;
        
        while ((match = regex.exec(part)) !== null) {
          if (match.index > lastIndex) {
            newParts.push(part.substring(lastIndex, match.index));
          }
          newParts.push(replacer(match, `${pIdx}-${match.index}`));
          lastIndex = regex.lastIndex;
        }
        if (lastIndex < part.length) {
          newParts.push(part.substring(lastIndex));
        }
      });
      parts = newParts;
    };

    applyRegex(/\[([^\]]+)\]\(([^)]+)\)/g, (match, key) => {
      const href = match[2].trim();
      const label = match[1];
      if (!/^https?:\/\//i.test(href)) {
        return <span key={key}>{label}</span>;
      }
      const isSourcePill = label.endsWith('↗');
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={
            isSourcePill
              ? 'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-accent-soft border border-accent/30 text-2xs text-accent hover:bg-accent/25 no-underline font-semibold ml-1 align-middle transition-colors'
              : 'text-accent hover:text-accent/80 underline font-medium'
          }
        >
          {label}
        </a>
      );
    });

    applyRegex(/`([^`]+)`/g, (match, key) => (
      <code key={key} className="bg-surface-input px-1.5 py-0.5 rounded-md border border-border-subtle text-2xs text-accent font-mono">
        {match[1]}
      </code>
    ));

    applyRegex(/\*\*([^*]+)\*\*/g, (match, key) => (
      <strong key={key} className="text-text-primary font-semibold">
        {match[1]}
      </strong>
    ));

    applyRegex(/\*([^*]+)\*/g, (match, key) => (
      <em key={key} className="text-text-primary italic">
        {match[1]}
      </em>
    ));

    return parts;
  };

  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;

        // Headers: #, ##, ###, ####, #####+
        if (trimmed.startsWith('#')) {
          const depth = (trimmed.match(/^#+/) || ['#'])[0].length;
          const content = trimmed.replace(/^#+\s*/, '');
          const boldText = renderInlineFormatting(content);

          if (depth === 1) {
            return (
              <h1 key={idx} className="text-sm font-semibold text-text-primary mt-4 mb-2 border-b border-border-subtle pb-1">
                {boldText}
              </h1>
            );
          }
          if (depth === 2) {
            return (
              <h2 key={idx} className="text-xs font-semibold text-text-primary mt-3 mb-1.5">
                {boldText}
              </h2>
            );
          }
          if (depth === 3) {
            return (
              <h3 key={idx} className="text-2xs font-semibold text-text-primary mt-2.5 mb-1">
                {boldText}
              </h3>
            );
          }
          if (depth === 4) {
            return (
              <h4 key={idx} className="text-2xs font-semibold text-text-muted mt-2 mb-1">
                {boldText}
              </h4>
            );
          }
          return (
            <h5 key={idx} className="text-2xs font-medium text-text-muted mt-1.5 mb-0.5 italic">
              {boldText}
            </h5>
          );
        }

        // List item (starts with '- ' or '* ')
        if (/^[-*]\s+/.test(trimmed)) {
          const cleanText = trimmed.replace(/^[-*]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1.5 my-0.5">
              <span className="text-accent select-none text-2xs mt-0.5">•</span>
              <p className="text-xs text-text-primary leading-relaxed flex-1">
                {renderInlineFormatting(cleanText)}
              </p>
            </div>
          );
        }

        // Standard Paragraph
        return (
          <p key={idx} className="text-xs text-text-primary leading-relaxed">
            {renderInlineFormatting(line)}
          </p>
        );
      })}
    </div>
  );
}
