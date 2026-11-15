import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from './Markdown';

describe('Markdown link sanitization', () => {
  it('renders unsafe javascript: and data: links as plain text', () => {
    render(
      <Markdown
        text={
          '[Executar JS](javascript:alert(1)) e [Abrir Data](data:text/html,<script>alert(1)</script>)'
        }
      />
    );

    expect(screen.getByText('Executar JS').tagName).toBe('SPAN');
    expect(screen.getByText('Abrir Data').tagName).toBe('SPAN');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders valid http and https links as anchors', () => {
    render(
      <Markdown text="[AssetFlow](https://example.com) e [Doc](http://localhost:3000)" />
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://example.com');
    expect(links[1]).toHaveAttribute('href', 'http://localhost:3000');
  });

  it('renders bold headings like **Análise de Risco (CoT):** without treating them as bullet lists', () => {
    render(
      <Markdown text={'**Análise de Risco (CoT):**\n- Primeiro ponto\n\n**Resumo Executivo:**\nTexto final.'} />
    );

    const heading = screen.getByText('Análise de Risco (CoT):');
    expect(heading.tagName).toBe('STRONG');
    expect(screen.getByText('Resumo Executivo:').tagName).toBe('STRONG');
    expect(screen.getByText('Primeiro ponto')).toBeInTheDocument();
  });
});
