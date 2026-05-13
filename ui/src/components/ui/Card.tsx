import { forwardRef, type HTMLAttributes, type Ref } from 'react';
import { cn } from '@/lib/cn.js';

export const Card = forwardRef(function Card(
  { className, ...props }: HTMLAttributes<HTMLDivElement>,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <div
      ref={ref}
      className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  );
});

export const CardHeader = forwardRef(function CardHeader(
  { className, ...props }: HTMLAttributes<HTMLDivElement>,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-4', className)} {...props} />
  );
});

export const CardTitle = forwardRef(function CardTitle(
  { className, ...props }: HTMLAttributes<HTMLHeadingElement>,
  ref: Ref<HTMLHeadingElement>,
) {
  return (
    <h3
      ref={ref}
      className={cn('font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
});

export const CardContent = forwardRef(function CardContent(
  { className, ...props }: HTMLAttributes<HTMLDivElement>,
  ref: Ref<HTMLDivElement>,
) {
  return <div ref={ref} className={cn('p-4 pt-0', className)} {...props} />;
});
