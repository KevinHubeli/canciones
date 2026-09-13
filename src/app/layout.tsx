import type { Metadata, Viewport } from "next";
import { Quicksand, Cinzel, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import SpaBackground from "@/components/SpaBackground";
import BottomNav from "@/components/BottomNav";

const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Cancionero",
  description:
    "Nuestras canciones con acordes: buscá, cambiá el tono y tocá desde el celular.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2e2338",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${quicksand.variable} ${cinzel.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="relative min-h-full flex flex-col bg-plum-deep text-mist overflow-x-hidden">
        <SpaBackground />
        <div className="relative z-10 flex min-h-full flex-1 flex-col pb-24">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
