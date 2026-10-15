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
      { source: '/about-us', destination: '/about', permanent: true },
      { source: '/terms-and-conditions', destination: '/terms', permanent: true },
      { source: '/tos', destination: '/terms', permanent: true },
      { source: '/privacy-policy', destination: '/privacy', permanent: true },
      { source: '/community-guidelines', destination: '/guidelines', permanent: true },
      { source: '/code-of-conduct', destination: '/guidelines', permanent: true },
    ];
  },
};

export default nextConfig;
