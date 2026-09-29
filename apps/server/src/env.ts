import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 3000),
  isProd: process.env.NODE_ENV === 'production',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  databaseUrl: process.env.DATABASE_URL ?? '',
};
