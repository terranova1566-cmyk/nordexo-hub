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
        <script
          // Next deployments can invalidate cached route chunks. If the browser has a stale
          // JS bundle, navigating to a new/updated page can throw a ChunkLoadError which
          // surfaces as "client-side exception". One automatic reload is usually enough.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var KEY="__nordexo_chunk_reload_ts__";var now=Date.now();var last=0;try{last=parseInt(sessionStorage.getItem(KEY)||"0",10)||0;}catch(e){}var canReload=!last||now-last>5*60*1000;function mark(){try{sessionStorage.setItem(KEY,String(Date.now()));}catch(e){}}function isChunkError(msg){if(!msg)return false;msg=String(msg);return msg.indexOf("ChunkLoadError")>=0||msg.indexOf("Loading chunk")>=0||msg.indexOf("Failed to fetch dynamically imported module")>=0;}function handler(ev){var msg=\"\";try{msg=(ev&&ev.message)||\"\";}catch(e){}if(!msg){try{msg=(ev&&ev.reason&&ev.reason.message)||ev&&ev.reason||\"\";}catch(e){}}if(isChunkError(msg)&&canReload){mark();try{window.location.reload();}catch(e){}}}window.addEventListener(\"error\",handler);window.addEventListener(\"unhandledrejection\",handler);}catch(e){}})();`,
          }}
        />
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
