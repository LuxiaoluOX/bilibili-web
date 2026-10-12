import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [{
    name: "trusted-development-client-address",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        request.headers["x-sjz-client-ip"] = request.socket.remoteAddress ?? "";
        next();
      });
    },
  }, tailwindcss(), reactRouter()],
  server: {
    host: "0.0.0.0",
    port: 8088,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 8088,
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
});
