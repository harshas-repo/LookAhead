/** @type {import('next').NextConfig} */

// Security headers applied to every response. The YouCam key and the access pass live
// only on the server; these are defense-in-depth (no framing, no MIME sniffing, a
// limited set of sources). The CSP deliberately allows 'unsafe-inline'/'unsafe-eval'
// so Next.js hydration and dev HMR keep working without nonces — tighten with nonces
// if you want a strict policy. The authorization cookie is HttpOnly regardless, so it
// is never readable by page script even if CSP were bypassed.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The photo-capture step uses the camera, so allow it for this origin only.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' ws:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'"
    ].join("; ")
  }
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    // Preview/result images come from provider-hosted or locally re-hosted storage.
    // We render them through <img> with remotePatterns kept permissive for the demo,
    // but we never expose the YouCam API key to the client.
    remotePatterns: [
      { protocol: "https", hostname: "**.makeupar.com" },
      { protocol: "https", hostname: "**.amazonaws.com" }
    ]
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default nextConfig;
