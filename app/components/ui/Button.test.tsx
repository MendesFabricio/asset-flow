import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Clique</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Clique' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Bloqueado
      </Button>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Bloqueado' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies the danger variant styles', () => {
    render(<Button variant="danger">Excluir</Button>);
    expect(screen.getByRole('button', { name: 'Excluir' }).className).toContain('bg-rose-600');
  });

  it('renders left and right icons', () => {
    render(
      <Button iconLeft={<span data-testid="left" />} iconRight={<span data-testid="right" />}>
        Texto
      </Button>
    );
    expect(screen.getByTestId('left')).toBeInTheDocument();
    expect(screen.getByTestId('right')).toBeInTheDocument();
  });
});
