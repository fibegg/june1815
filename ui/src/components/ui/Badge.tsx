import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn.js';

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'bg-primary/15 text-primary border border-primary/20',
  secondary: 'bg-secondary text-secondary-foreground',
  destructive: 'bg-destructive/15 text-destructive border border-destructive/20',
  outline: 'border border-border text-muted-foreground',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
