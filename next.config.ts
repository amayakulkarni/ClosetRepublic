import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/gazetee/:path*', destination: '/gazette/:path*', permanent: true },
      { source: '/pass', destination: '/passport', permanent: true },
      { source: '/finance', destination: '/funding', permanent: true },
    ];
  },
};

export default nextConfig;
