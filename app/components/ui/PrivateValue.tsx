'use client';
import React from 'react';
import { usePrivacy } from '../../context/PrivacyContext';

interface PrivateValueProps {
  value: string | number;
  className?: string;
}

export function PrivateValue({ value, className = "" }: PrivateValueProps) {
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  
  const displayValue = isHidden 
    ? (className.includes('pct') ? '•••%' : '••••••') 
    : value;

  return <span className={className}>{displayValue}</span>;
}
