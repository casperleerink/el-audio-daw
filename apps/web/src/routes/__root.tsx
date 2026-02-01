import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "../index.css";
import { ZeroProvider } from "@/components/ZeroProvider";
import type { RouterContext } from "@/main";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "Elementary Audio Workstation",
      },
      {
        name: "description",
        content: "Elementary Audio Workstation is a web application",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <ZeroProvider>
          <Outlet />
        </ZeroProvider>
        <Toaster richColors />
      </ThemeProvider>
    </>
  );
}
