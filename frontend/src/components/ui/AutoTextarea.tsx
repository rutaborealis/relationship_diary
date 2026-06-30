import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Textarea that grows with its content (no inner scrollbar). */
export function AutoTextarea({ className = '', value, rows = 1, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={`autogrow ${className}`}
      value={value}
      rows={rows}
      {...props}
    />
  );
}
