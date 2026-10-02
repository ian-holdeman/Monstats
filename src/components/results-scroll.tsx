'use client';
import { useEffect, useRef, type ReactNode } from 'react';

export function ResultsScroll({
  label,
  resetKey,
  className = '',
  children,
}: {
  label: string;
  resetKey: string;
  className?: string;
  children: ReactNode;
}) {
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (region.current) {
      region.current.scrollTop = 0;
      region.current.scrollLeft = 0;
    }
  }, [resetKey]);
  return (
    <div
      ref={region}
      className={`results-scroll ${className}`}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
