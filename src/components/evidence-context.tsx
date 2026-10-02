'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import {
  performanceReasons,
  type PerformanceEvidence,
} from '@/domain/evidence';

export function QualityInfo({
  label,
  reasons,
}: {
  label: string;
  reasons: string[];
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, above: false });
  const reveal = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const above = rect.bottom + 180 > window.innerHeight && rect.top > 180;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)),
      top: above ? rect.top - 6 : rect.bottom + 6,
      above,
    });
    setOpen(true);
  }, []);
  function leave() {
    if (!pinned && document.activeElement !== button.current)
      leaveTimer.current = setTimeout(() => setOpen(false), 150);
  }
  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    function close(e: Event) {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      if (
        e.type === 'pointerdown' &&
        (button.current?.contains(e.target as Node) ||
          popup.current?.contains(e.target as Node))
      )
        return;
      setOpen(false);
      setPinned(false);
    }
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    function reposition() {
      if (pinned || document.activeElement === button.current) reveal();
      else {
        setOpen(false);
        setPinned(false);
      }
    }
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, pinned, reveal]);
  if (!reasons.length) return null;
  return (
    <span className="quality-info">
      <button
        ref={button}
        type="button"
        aria-label={`${label}: data context`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={reveal}
        onMouseLeave={leave}
        onFocus={reveal}
        onBlur={() => {
          setOpen(false);
          setPinned(false);
        }}
        onClick={() => {
          if (pinned) {
            setOpen(false);
            setPinned(false);
          } else {
            reveal();
            setPinned(true);
          }
        }}
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <span
            ref={popup}
            onMouseEnter={() => {
              if (leaveTimer.current) clearTimeout(leaveTimer.current);
            }}
            onMouseLeave={leave}
            id={id}
            role="tooltip"
            className="quality-popover"
            style={{
              left: position.left,
              top: position.top,
              transform: position.above ? 'translateY(-100%)' : undefined,
            }}
          >
            {reasons.map((reason) => (
              <span key={reason}>{reason}</span>
            ))}
          </span>,
          document.body,
        )}
    </span>
  );
}
export function PerformanceInfo({
  label,
  evidence,
  baseline,
  matches,
  baselineMatches,
  compareBaseline = false,
}: {
  label: string;
  evidence?: PerformanceEvidence;
  baseline?: PerformanceEvidence;
  matches?: number;
  baselineMatches?: number;
  compareBaseline?: boolean;
}) {
  return (
    <QualityInfo
      label={label}
      reasons={performanceReasons({
        evidence,
        matches,
        baseline,
        baselineMatches,
        compareBaseline,
      })}
    />
  );
}
export function EvidenceDetails({
  evidence,
}: {
  evidence?: PerformanceEvidence;
}) {
  if (!evidence) return <span>Supporting sample unavailable.</span>;
  return (
    <span>
      {evidence.matches} distinct physical matches/series · {evidence.events}{' '}
      events. Largest event:{' '}
      {evidence.largestEventShare === null
        ? 'unavailable'
        : `${evidence.largestEventShare.toFixed(1)}% of physical results`}
      .
      {evidence.sources && (
        <>
          {' '}
          Source records:{' '}
          {evidence.sources.length
            ? evidence.sources
                .map((s) => `${s.provider} ${s.matches}`)
                .join(' · ')
            : 'none'}
          . Provider membership can overlap; counts are not additive.
        </>
      )}
    </span>
  );
}
export const evidenceSortHelp =
  'Most evidence orders distinct physical matches/series first, then event breadth and canonical identity. It describes volume, not a guarantee of reliability.';
