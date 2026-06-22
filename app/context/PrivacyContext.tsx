'use client';
import { createContext, useContext, useState, ReactNode } from 'react';
import { secureStorage } from '../utils/apiClient';

interface PrivacyContextType {
  isHidden: boolean;
  togglePrivacy: () => void;
}

const PrivacyContext = createContext<PrivacyContextType>({
  isHidden: false,
  togglePrivacy: () => { },
});

export const PrivacyProvider = ({ children }: { children: ReactNode }) => {
  // Inicialização estável resolve o erro de render em cascata do linter
  const [isHidden, setIsHidden] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = secureStorage.get('assetflow_privacy');
      return saved === 'true';
    }
    return false;
  });

  const togglePrivacy = () => {
    setIsHidden((prev) => {
      const newState = !prev;
      secureStorage.set('assetflow_privacy', String(newState));
      return newState;
    });
  };

  return (
    <PrivacyContext.Provider value={{ isHidden, togglePrivacy }}>
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = () => useContext(PrivacyContext);
