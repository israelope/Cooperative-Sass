/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Bulk-import spreadsheets are posted through a server action (default limit is 1 MB).
    serverActions: { bodySizeLimit: '3mb' },
  },
};
module.exports = nextConfig;
