/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Bulk-import spreadsheets are posted through a server action (default limit is 1 MB).
    serverActions: { bodySizeLimit: '3mb' },
  },
  async redirects() {
    // The earlier /c/<co-op>/... links are still shared in messages and bookmarks.
    return [
      { source: '/c/:slug', destination: '/:slug', permanent: false },
      { source: '/c/:slug/:path*', destination: '/:slug/:path*', permanent: false },
    ];
  },
  async rewrites() {
    // The browser shows /<co-op>/..., while the app keeps its single set of pages.
    // The proxy verifies the slug belongs to the signed-in tenant before this runs.
    return [
      { source: '/:slug/member', destination: '/member' },
      { source: '/:slug/admin', destination: '/admin' },
      { source: '/:slug/member/:path*', destination: '/member/:path*' },
      { source: '/:slug/admin/:path*', destination: '/admin/:path*' },
    ];
  },
};
module.exports = nextConfig;
