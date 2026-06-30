import type { TextareaHTMLAttributes } from 'react';
import { AutoTextarea } from './AutoTextarea';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', ...props }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {label && <label className="field-label">{label}</label>}
      <AutoTextarea
        className={`textarea${error ? ' !border-red-400' : ''} ${className}`}
        {...props}
      />
      {error && <p style={{ fontSize: '.75rem', color: '#C05050' }}>{error}</p>}
    </div>
  );
}
