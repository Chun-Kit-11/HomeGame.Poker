import { z } from 'zod';

/** Name shown at the table: 2-16 characters of letters, digits, spaces, _ . - */
export const playerNameSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(16, 'Name must be at most 16 characters')
      .regex(/^[\p{L}\p{N} _.-]+$/u, 'Only letters, numbers, spaces, _ . -'),
  );

export const guestSchema = z.object({ name: playerNameSchema });

export type Guest = z.infer<typeof guestSchema>;
