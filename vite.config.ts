import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        "https://c--f111521e-3707-441f-8c3f-0c94abd9ac40-prod.lovable.cloud"
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        "sb_publishable_4xuL08bqqsTf-Yc2p_R5Vw_E4rIW-U-"
      ),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
        "cjmvdrxdygektwyvugbc"
      ),
    },
  },
});
