import { forwardRef, type InputHTMLAttributes, type Ref } from 'react';
import { cn } from '@/lib/cn.js';

export const Input = forwardRef(function Input(
  { className, type = 'text', ...props }: InputHTMLAttributes<HTMLInputElement>,
  ref: Ref<HTMLInputElement>,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm',
        'shadow-sm transition-colors',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
