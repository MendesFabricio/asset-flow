import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';
import { Card } from './Card';

describe('Badge', () => {
  it('renders the label uppercased via CSS class', () => {
    render(<Badge label="Novo" />);
    const badge = screen.getByText('Novo');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('uppercase');
  });

  it('applies the emerald variant', () => {
    render(<Badge label="Ok" variant="emerald" />);
    expect(screen.getByText('Ok').className).toContain('text-emerald-400');
  });
});

describe('Card', () => {
  it('renders children', () => {
    render(
      <Card>
        <p>conteúdo</p>
      </Card>
    );
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });

  it('merges custom className', () => {
    const { container } = render(<Card className="minha-classe">x</Card>);
    expect(container.firstChild).toHaveClass('minha-classe');
  });

  it('applies the emerald variant border', () => {
    const { container } = render(<Card variant="emerald">x</Card>);
    expect((container.firstChild as HTMLElement).className).toContain('border-emerald-900/30');
  });
});
