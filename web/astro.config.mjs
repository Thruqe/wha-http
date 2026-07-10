import { defineConfig } from "astro/config";
import UnoCSS from "unocss/astro";

export default defineConfig({
    integrations: [UnoCSS({ injectReset: true })],
    vite: {
        server: {
            proxy: {
                "/ws": {
                    target: "http://localhost:8080",
                    ws: true,
                    rewriteWsOrigin: true,
                    configure: (proxy) => {
                        proxy.on("error", (err) =>
                            console.error("[proxy error]", err),
                        );
                        proxy.on("proxyReqWs", (_req, _socket, _head) =>
                            console.log("[proxy] ws upgrade sent"),
                        );
                        proxy.on("open", () =>
                            console.log("[proxy] ws upstream open"),
                        );
                        proxy.on("close", () =>
                            console.log("[proxy] ws upstream close"),
                        );
                    },
                },
            },
        },
    },
});
