import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, SpinnerIcon } from './Icons';

type ActionPhase = 'idle' | 'busy' | 'success';
type ActionButtonVariant = 'primary' | 'secondary';

interface ActionButtonProps {
  variant?: ActionButtonVariant;
  idleLabel: string;
  busyLabel?: string;
  successLabel: string;
  idleIcon: ReactNode;
  onAction: () => Promise<boolean>;
  disabled?: boolean;
  successHoldMs?: number;
  className?: string;
}

function ActionButton({
  variant = 'secondary',
  idleLabel,
  busyLabel,
  successLabel,
  idleIcon,
  onAction,
  disabled = false,
  successHoldMs = 2000,
  className,
}: ActionButtonProps) {
  const [phase, setPhase] = useState<ActionPhase>('idle');
  const holdTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const runAction = async () => {
    if (phase === 'busy') {
      return;
    }

    clearHoldTimer();

    if (busyLabel) {
      setPhase('busy');
    }

    let succeeded = false;

    try {
      succeeded = await onAction();
    } catch {
      succeeded = false;
    }

    if (!succeeded) {
      setPhase('idle');
      return;
    }

    setPhase('success');
    holdTimerRef.current = window.setTimeout(() => {
      setPhase('idle');
      holdTimerRef.current = null;
    }, successHoldMs);
  };

  const labelClasses = `action-button action-button--${variant}${className ? ` ${className}` : ''}`;

  return (
    <button
      className={labelClasses}
      type="button"
      data-phase={phase}
      onClick={() => void runAction()}
      disabled={disabled || phase === 'busy'}
    >
      <span className="action-button__icons" aria-hidden="true">
        <span className="action-button__icon" data-active={phase === 'idle'}>
          {idleIcon}
        </span>
        <span className="action-button__icon" data-active={phase === 'busy'}>
          <SpinnerIcon size={15} className="action-button__spinner" />
        </span>
        <span className="action-button__icon" data-active={phase === 'success'}>
          <CheckIcon size={15} className="action-button__check" />
        </span>
      </span>

      <span className="action-button__labels">
        <span className="action-button__label" data-active={phase === 'idle'} aria-hidden={phase !== 'idle'}>
          {idleLabel}
        </span>
        <span className="action-button__label" data-active={phase === 'busy'} aria-hidden={phase !== 'busy'}>
          {busyLabel ?? idleLabel}
        </span>
        <span className="action-button__label" data-active={phase === 'success'} aria-hidden={phase !== 'success'}>
          {successLabel}
        </span>
      </span>

      {}
      <span className="visually-hidden" role="status">
        {phase === 'busy' ? busyLabel ?? '' : phase === 'success' ? successLabel : ''}
      </span>
    </button>
  );
}

export default ActionButton;
