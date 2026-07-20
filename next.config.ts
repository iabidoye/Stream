import type { NextConfig } from "next";

const REQUIRED_ENV = ["OANDA_TOKEN", "OANDA_ACCOUNT_ID", "OANDA_ENV"] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.warn(`\x1b[33m⚠  Missing env var: ${key}\x1b[0m`);
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
};
export default nextConfig;
