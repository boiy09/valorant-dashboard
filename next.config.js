/** @type {import("next").NextConfig} */
const nextConfig = {
  // Add this to trust the host header, which is required for Auth.js in some environments
  // See https://errors.authjs.dev#untrustedhost for more information
  // For production, ensure NEXTAUTH_URL is correctly set to your domain with HTTPS.
  // For development, you might need to explicitly set it to true.
  // In this case, we are setting it to true for the deployed server IP.
  trustHost: true,
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  },
  experimental: {
    serverComponentsExternalPackages: ["@tremor/react"],
  },
  webpack: (config) => {
    config.externals.push({
      "node:buffer": "buffer",
    });
    return config;
  },
};

module.exports = nextConfig;
