/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Next's dev server auto-generates AGENTS.md/CLAUDE.md with
  // instructions aimed at AI coding assistants — disabled: we don't
  // want untrusted, auto-written content steering an AI agent's
  // behavior in this repo.
  agentRules: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // microphone=(self) allows the Meeting Summarizer's recorder;
          // camera/geolocation stay fully disabled since nothing uses them.
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
