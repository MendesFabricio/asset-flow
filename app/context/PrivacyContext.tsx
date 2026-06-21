'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { secureStorage } from '../utils/apiClient';

interface PrivacyContextType {
  isHidden: boolean;
  togglePrivacy: () => void;
}

const PrivacyContext = createContext<PrivacyContextType>({
  isHidden: false,
  togglePrivacy: () => {},
});

export const PrivacyProvider = ({ children }: { children: ReactNode }) => {
  const [isHidden, setIsHidden] = useState(false);

  // Recupera a preferência do usuário (se ele deixou escondido antes)
  useEffect(() => {
    const saved = secureStorage.get('assetflow_privacy');
    if (saved === 'true') setIsHidden(true);
  }, []);

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
