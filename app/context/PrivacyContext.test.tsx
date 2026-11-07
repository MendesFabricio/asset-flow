import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { PrivacyProvider, usePrivacy } from './PrivacyContext';

// Helper component to consume context
const TestComponent = () => {
    const { isHidden, togglePrivacy } = usePrivacy();
    return (
        <div>
            <span data-testid="hidden-status">{isHidden ? 'Hidden' : 'Visible'}</span>
            <button data-testid="toggle-btn" onClick={togglePrivacy}>Toggle</button>
        </div>
    );
};

describe('PrivacyContext', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should default to Visible if localStorage is empty', () => {
        render(
            <PrivacyProvider>
                <TestComponent />
            </PrivacyProvider>
        );

        expect(screen.getByTestId('hidden-status')).toHaveTextContent('Visible');
    });

    it('should load legacy true from localStorage and upgrade it to obscure', () => {
        localStorage.setItem('assetflow_privacy', 'true');

        render(
            <PrivacyProvider>
                <TestComponent />
            </PrivacyProvider>
        );

        expect(screen.getByTestId('hidden-status')).toHaveTextContent('Hidden');
        
        // It should have upgraded the key in localStorage
        const newValue = localStorage.getItem('assetflow_privacy');
        expect(newValue).not.toBe('true');
        expect(newValue).toBeTruthy();
    });

    it('should toggle state and save obscured value to localStorage', () => {
        render(
            <PrivacyProvider>
                <TestComponent />
            </PrivacyProvider>
        );

        expect(screen.getByTestId('hidden-status')).toHaveTextContent('Visible');
        
        const btn = screen.getByTestId('toggle-btn');
        act(() => {
            btn.click();
        });

        expect(screen.getByTestId('hidden-status')).toHaveTextContent('Hidden');
        
        const saved = localStorage.getItem('assetflow_privacy');
        expect(saved).not.toBeNull();
        expect(saved).not.toBe('true'); // Should be obscured
        
        // Toggle again
        act(() => {
            btn.click();
        });

        expect(screen.getByTestId('hidden-status')).toHaveTextContent('Visible');
        
        const saved2 = localStorage.getItem('assetflow_privacy');
        expect(saved2).not.toBe(saved);
    });

    it('should load obscured true correctly', () => {
        // Obscure value of 'true' with SECRET_SALT="assetflow_secure_salt_2026"
        const salted = "assetflow_secure_salt_2026:true";
        const obscured = btoa(salted).split('').reverse().join('');
        
        localStorage.setItem('assetflow_privacy', obscured);

        render(
            <PrivacyProvider>
                <TestComponent />
            </PrivacyProvider>
        );

        expect(screen.getByTestId('hidden-status')).toHaveTextContent('Hidden');
    });
});
