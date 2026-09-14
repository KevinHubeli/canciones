import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import SpaBackground from "@/components/SpaBackground";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Cancionero",
  description:
    "Nuestras canciones con acordes: buscá, cambiá el tono y tocá desde el celular.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1918" },
  ],
};

// Aplica el tema guardado antes de pintar, para que no haya un flash del
// tema equivocado al cargar (no se puede leer localStorage en el server).
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("cancionero:theme");
  if (t === "light" || t === "dark") {
    document.documentElement.setAttribute("data-theme", t);
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${manrope.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="relative min-h-full flex flex-col bg-plum-deep text-mist overflow-x-hidden">
        <SpaBackground />
        <ServiceWorkerRegister />
        <div className="relative z-10 flex min-h-full flex-1 flex-col pb-24">
          {children}
        </div>
        <Suspense fallback={null}>
          <BottomNav />
        </Suspense>
      </body>
    </html>
  );
}
