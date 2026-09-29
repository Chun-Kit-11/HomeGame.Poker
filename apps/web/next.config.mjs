/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ['@poker/engine', '@poker/shared'],
  poweredByHeader: false,
  devIndicators: false,
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
