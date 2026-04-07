import {withSentryConfig} from "@sentry/nextjs";
import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  outputFileTracingRoot: path.join(process.cwd(), '../../'),
}

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const hasSentryToken = sentryAuthToken && !sentryAuthToken.startsWith("placeholder");

export default withSentryConfig(nextConfig, {
  authToken: sentryAuthToken,
  org: "clonai",
  project: "clon-ai",

  silent: !process.env.CI,

  sourcemaps: {
    disable: !hasSentryToken,
  },

  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",

  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
  },
});