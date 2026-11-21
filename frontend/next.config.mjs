/** @type {import('next').NextConfig} */
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'sha256-Q+8tPsjVtiDsjF/Cv8FMOpg2Yg91oKFKDAJat1PPb2g=' 'sha256-wRfIeDJt1bwSFMRfDMdxwZUuTvLK9u/LfEuCnHlx/48=' 'sha256-GFpz/zVIUU2ZAUkGWb4h9JIE7hkc+D/bZEg57m6KhTI=' 'sha256-SuvDUVSgu1EylxDW0Zmi63F4cRbdpXk3lo+HuGdvqEM=' 'sha256-9oBNF6r3wSK5obdVtsJV65mp5r9g65B4RKgfI6Gl27U=' 'sha256-I8psbrxpQgB9+D5b2Jt+HJJtG9muUZs9cjqZxUbX1+A=' https://tierlens.onrender.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://tierlens.onrender.com;
  font-src 'self' data:;
  connect-src 'self' https://tierlens.onrender.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
`.replace(/\s{2,}/g, ' ').trim();

const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader,
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_API_URL 
          ? `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`
          : 'https://tierlens.onrender.com/api/:path*',
      },
    ];
  },
};

export default nextConfig;
