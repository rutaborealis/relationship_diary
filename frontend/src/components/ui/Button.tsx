import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'add' | 'danger';
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  loading,
  fullWidth,
  children,
  className = '',
  disabled,
  style,
  ...props
}: Props) {
  const cls =
    variant === 'primary' ? 'btn-save' :
    variant === 'ghost'   ? 'btn-ghost' :
    variant === 'add'     ? 'btn-add' :
    'btn-danger';

  return (
    <button
      className={`${cls}${!fullWidth && variant === 'primary' ? ' !w-auto px-6' : ''} ${className}`}
      style={fullWidth ? style : { width: 'auto', ...style }}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
