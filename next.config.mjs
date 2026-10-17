/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  // Ship the Chromium binary pack into the /api/pdf serverless function. Without this,
  // Next's file tracer drops node_modules/@sparticuz/chromium/bin and the launch fails.
  outputFileTracingIncludes: {
    '/api/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
};

export default nextConfig;
