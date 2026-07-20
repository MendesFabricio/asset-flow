import { describe, it, expect } from 'vitest';
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './ToastContext';

function Trigger() {
  const { notify } = useToast();
  return (
    <button type="button" onClick={() => notify('Salvo com sucesso', 'success')}>
      disparar
    </button>
  );
}

describe('ToastContext', () => {
  it('shows a toast when notify is called', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'disparar' }));
    expect(screen.getByText('Salvo com sucesso')).toBeInTheDocument();
    expect(screen.getByText('Sucesso')).toBeInTheDocument();
  });

  it('lets the user dismiss the toast manually', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'disparar' }));
    const toast = screen.getByText('Salvo com sucesso');
    expect(toast).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Fechar notificação' }));
    expect(screen.queryByText('Salvo com sucesso')).not.toBeInTheDocument();
  });

  it('auto-dismisses the toast after the timeout', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'disparar' }));
    expect(screen.getByText('Salvo com sucesso')).toBeInTheDocument();

    await waitForElementToBeRemoved(() => screen.queryByText('Salvo com sucesso'), {
      timeout: 5000,
    });
  });
});
