/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === "production";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Keep the local FastAPI proxy only for development.
    if (isProduction) {
      return [];
    }

    return [
      {
        source: "/api/v1/:path*",
        destination: "http://127.0.0.1:8000/api/v1/:path*",
      },
    ];
  },
}

module.exports = nextConfig
