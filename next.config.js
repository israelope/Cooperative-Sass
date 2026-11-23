/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Bulk-import spreadsheets are posted through a server action (default limit is 1 MB).
    serverActions: { bodySizeLimit: '3mb' },
  },
  async rewrites() {
    // Members and staff see /c/<co-op>/... in the address bar, while the app
    // keeps its single set of pages. The proxy verifies the slug is the
    // signed-in tenant's before these rewrites are used.
    return [
      { source: '/c/:slug/member', destination: '/member' },
      { source: '/c/:slug/admin', destination: '/admin' },
      { source: '/c/:slug/member/:path*', destination: '/member/:path*' },
      { source: '/c/:slug/admin/:path*', destination: '/admin/:path*' },
    ];
  },
};
module.exports = nextConfig;
