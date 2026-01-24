import type { Metadata } from "next";
import Providers from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product Manager",
  description: "Partner portal for searching, saving, and exporting products.",
  icons: {
    icon: "/brand/LogoIcon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-app-ready="0">
      <head>
        <style>{`
          #app-preload {
            position: fixed;
            inset: 0;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            opacity: 1;
            transition: opacity 160ms ease;
          }
          #app-preload .app-preload-spinner {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            border: 3px solid #dbeafe;
            border-top-color: #0f6cbd;
            animation: app-preload-spin 0.8s linear infinite;
          }
          @keyframes app-preload-spin {
            to {
              transform: rotate(360deg);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            #app-preload .app-preload-spinner {
              animation-duration: 1.6s;
            }
          }
          html[data-app-ready="1"] #app-preload {
            opacity: 0;
            pointer-events: none;
          }
        `}</style>
      </head>
      <body>
        <div id="app-preload" aria-hidden="true">
          <div className="app-preload-spinner" role="status" aria-label="Loading" />
        </div>
        <Providers>{children}</Providers>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var markReady=function(){document.documentElement.setAttribute('data-app-ready','1');};if(document.readyState==='complete'){markReady();}else{window.addEventListener('load',markReady);}})();`,
          }}
        />
      </body>
    </html>
  );
}
