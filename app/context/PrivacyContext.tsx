'use client';
import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';

interface PrivacyContextType {
  isHidden: boolean;
  togglePrivacy: () => void;
}

const PrivacyContext = createContext<PrivacyContextType>({
  isHidden: false,
  togglePrivacy: () => { },
});

const SECRET_SALT = "assetflow_secure_salt_2026";

const obscureValue = (value: string): string => {
  const saltedStr = `${SECRET_SALT}:${value}`;
  return btoa(saltedStr).split('').reverse().join('');
};

const deobscureValue = (obscured: string): string => {
  try {
    const reversed = obscured.split('').reverse().join('');
    const decoded = atob(reversed);

    if (decoded.startsWith(`${SECRET_SALT}:`)) {
      return decoded.replace(`${SECRET_SALT}:`, '');
    }
  } catch {
    // Tratamento de erro vazio para fallback de dados legados
  }
  return obscured;
};

export const PrivacyProvider = ({ children }: { children: ReactNode }) => {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('assetflow_privacy');
    if (saved) {
      const decrypted = deobscureValue(saved);

      if (decrypted === 'true') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsHidden(true);
      } else if (saved === 'true') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsHidden(true);
        localStorage.setItem('assetflow_privacy', obscureValue('true'));
      }
    }
  }, []);

  const togglePrivacy = () => {
    setIsHidden((prev) => {
      const newState = !prev;
      localStorage.setItem('assetflow_privacy', obscureValue(String(newState)));
      return newState;
    });
  };

  const value = useMemo(() => ({ isHidden, togglePrivacy }), [isHidden]);

  return (
    <PrivacyContext.Provider value={value}>
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = () => useContext(PrivacyContext);
