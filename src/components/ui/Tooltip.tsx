import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TooltipPlacement = 'top' | 'bottom' | 'right-top';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  placement?: TooltipPlacement;
  width?: number;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  className?: string;
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  width = 224,
  backgroundColor,
  borderColor,
  textColor,
  className = ''
}: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) {
      return;
    }

    const margin = 12;
    const gap = 8;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    let left = 0;
    let top = 0;

    if (placement === 'bottom') {
      left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      top = triggerRect.bottom + gap;
      if (top + tooltipRect.height > window.innerHeight - margin) {
        top = triggerRect.top - tooltipRect.height - gap;
      }
    } else if (placement === 'right-top') {
      left = triggerRect.right + gap;
      top = triggerRect.top - tooltipRect.height + triggerRect.height;
      if (left + tooltipRect.width > window.innerWidth - margin) {
        left = triggerRect.left - tooltipRect.width - gap;
      }
      if (top < margin) {
        top = margin;
      }
    } else {
      left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      top = triggerRect.top - tooltipRect.height - gap;
      if (top < margin) {
        top = triggerRect.bottom + gap;
      }
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));

    setCoords({ left, top });
  }, [visible, placement, width, content]);

  return (
    <span
      ref={triggerRef}
      className={className}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && typeof document !== 'undefined' ? createPortal(
        <span
          ref={tooltipRef}
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
            width,
            pointerEvents: 'none',
            zIndex: 9999,
            border: `1px solid ${borderColor}`,
            backgroundColor,
            color: textColor,
            backdropFilter: 'blur(14px) saturate(140%)',
            WebkitBackdropFilter: 'blur(14px) saturate(140%)',
            boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)',
            borderRadius: 12,
            padding: '10px 12px',
            fontSize: 11,
            lineHeight: 1.45,
            fontWeight: 400,
            whiteSpace: 'normal'
          }}
        >
          {content}
        </span>,
        document.body
      ) : null}
    </span>
  );
}
