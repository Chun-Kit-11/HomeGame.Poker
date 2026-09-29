import { z } from 'zod';

/** 3-20 characters: letters, digits, underscore. Case-insensitive uniqueness. */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be at most 20 characters')
  .regex(/^[A-Za-z0-9_]+$/, 'Only letters, numbers and underscores');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password is too long');

export const credentialsSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export type Credentials = z.infer<typeof credentialsSchema>;
