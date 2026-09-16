import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import type { SharedChatSpeaker } from './chat/SharedChatBubbles';

export type SpeakerPickerOption = [string, SharedChatSpeaker];

type SpeakerDotProps = {
  speaker?: Pick<SharedChatSpeaker, 'style' | 'type'>;
  accentColor: string;
  size?: number;
};

export function SpeakerDot({ speaker, accentColor, size = 12 }: SpeakerDotProps) {
  const [isHovered, setIsHovered] = useState(false);
  const style = speaker?.style || {};
  const backgroundColor = style.textColor || '#ffffff';
  const borderColor = style.bgColor || (speaker?.type === 'annotation' ? '#111827' : '#888888');

  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-full border-2 cursor-pointer transition-all duration-300"
      style={{
        width: size,
        height: size,
        backgroundColor,
        borderColor,
        boxShadow: isHovered
          ? `0 0 10px ${accentColor}cc, 0 0 18px ${accentColor}55`
          : `0 0 4px ${accentColor}99`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    />
  );
}

type SpeakerPickerTheme = {
  inputBg: string;
  border: string;
  text: string;
  panelBgElevated: string;
  hoverBg: string;
  textMuted: string;
};

interface SpeakerPickerProps {
  options: SpeakerPickerOption[];
  value: string;
  onChange: (speakerId: string) => void;
  accentColor: string;
  theme: SpeakerPickerTheme;
  buttonClassName?: string;
  buttonStyle?: CSSProperties;
  ariaLabel?: string;
  disabled?: boolean;
  menuWidth?: number;
}

type MenuPosition = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

export function SpeakerPicker({
  options,
  value,
  onChange,
  accentColor,
  theme,
  buttonClassName = '',
  buttonStyle,
  ariaLabel,
  disabled = false,
  menuWidth = 180,
}: SpeakerPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find(([speakerId]) => speakerId === value);
  const selectedSpeaker = selectedOption?.[1];
  const selectedLabel = selectedOption ? (selectedSpeaker?.name || selectedOption[0]) : value;

  const openMenu = () => {
    if (disabled || options.length === 0 || !triggerRef.current) {
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : rect.right;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : rect.bottom + 320;
    const width = Math.min(Math.max(rect.width, menuWidth), Math.max(120, viewportWidth - 16));
    const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - width - 8));
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 8);
    const spaceAbove = Math.max(0, rect.top - 8);
    const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const availableHeight = openAbove ? spaceAbove : spaceBelow;

    setMenuPosition({
      left,
      width,
      maxHeight: Math.max(96, Math.min(320, availableHeight || 320)),
      ...(openAbove ? { bottom: viewportHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
    setIsOpen(true);
  };

  const toggleMenu = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    openMenu();
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || menuRef.current?.contains(target))) {
        return;
      }
      setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    const closeOnViewportChange = () => setIsOpen(false);

    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', closeOnEscape, true);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('keydown', closeOnEscape, true);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [isOpen]);

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
      }
    }
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, speakerId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onChange(speakerId);
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  const menu = isOpen && menuPosition && typeof document !== 'undefined' ? createPortal(
    <div
      ref={menuRef}
      role="listbox"
      aria-label={ariaLabel}
      className="overflow-y-auto rounded-xl border p-1 shadow-2xl"
      style={{
        position: 'fixed',
        left: menuPosition.left,
        top: menuPosition.top,
        bottom: menuPosition.bottom,
        width: menuPosition.width,
        maxHeight: menuPosition.maxHeight,
        zIndex: 1400,
        backgroundColor: theme.panelBgElevated,
        borderColor: `${accentColor}44`,
        color: theme.text,
      }}
    >
      {options.map(([speakerId, speaker]) => {
        const isSelected = speakerId === value;
        return (
          <button
            key={speakerId}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={(event) => {
              event.stopPropagation();
              onChange(speakerId);
              setIsOpen(false);
            }}
            onKeyDown={(event) => handleOptionKeyDown(event, speakerId)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors"
            style={{
              minWidth: 0,
              backgroundColor: isSelected ? `${accentColor}18` : 'transparent',
              color: theme.text,
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor = theme.hoverBg;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = isSelected ? `${accentColor}18` : 'transparent';
            }}
          >
            <SpeakerDot speaker={speaker} accentColor={accentColor} />
            <span className="min-w-0 flex-1 truncate">{speaker.name || speakerId}</span>
            {isSelected ? <Check size={13} className="shrink-0" style={{ color: accentColor }} /> : null}
          </button>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled || options.length === 0}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          toggleMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`inline-flex min-w-0 items-center gap-1.5 border ${buttonClassName}`}
        style={{
          backgroundColor: theme.inputBg,
          borderColor: `${accentColor}44`,
          color: theme.text,
          ...buttonStyle,
        }}
      >
        <SpeakerDot speaker={selectedSpeaker} accentColor={accentColor} />
        <span className="min-w-0 flex-1 truncate text-left">{selectedLabel || '—'}</span>
        <ChevronDown size={13} className="shrink-0 opacity-65" />
      </button>
      {menu}
    </>
  );
}
