import type { Config } from "@react-router/dev/config";

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  // Caddy terminates HTTPS and forwards to the local HTTP listener. Keep the
  // action origin guard enabled while explicitly trusting the public host.
  allowedActionOrigins: ["sjz.lx-zero.cn", "sjz-zero.duckdns.org"],
} satisfies Config;
