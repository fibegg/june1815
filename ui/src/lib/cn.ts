import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-style class merger: clsx for conditional combinations, twMerge
 *  for handling Tailwind utility conflicts (e.g. `p-2 p-4` -> `p-4`). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
