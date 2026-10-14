import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/gazetee/:path*', destination: '/gazette/:path*', permanent: true },
      { source: '/pass', destination: '/passport', permanent: true },
      { source: '/finance', destination: '/funding', permanent: true },
      { source: '/goals', destination: '/timeline', permanent: true },
      { source: '/roadmap', destination: '/timeline', permanent: true },
      { source: '/contribute', destination: '/development', permanent: true },
      { source: '/dev', destination: '/development', permanent: true },
    ];
  },
};

export default nextConfig;
