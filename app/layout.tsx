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
          // surfaces as "client-side exception". Force a cache-busted reload when this happens.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var TS_KEY="__nordexo_chunk_reload_ts__";var COUNT_KEY="__nordexo_chunk_reload_count__";var now=Date.now();var last=0;var count=0;try{last=parseInt(sessionStorage.getItem(TS_KEY)||"0",10)||0;count=parseInt(sessionStorage.getItem(COUNT_KEY)||"0",10)||0;}catch(e){}function setState(){try{sessionStorage.setItem(TS_KEY,String(Date.now()));sessionStorage.setItem(COUNT_KEY,String(count+1));}catch(e){}}function resetState(){try{sessionStorage.removeItem(TS_KEY);sessionStorage.removeItem(COUNT_KEY);}catch(e){}}function msgFromEvent(ev){var msg="";try{msg=(ev&&ev.message)||"";}catch(e){}if(!msg){try{msg=(ev&&ev.reason&&ev.reason.message)||ev&&ev.reason||"";}catch(e){}}return String(msg||"");}function scriptUrlFromEvent(ev){try{var target=ev&&ev.target;if(target&&target.tagName==="SCRIPT"&&typeof target.src==="string"){return target.src;}}catch(e){}return "";}function isChunkMessage(msg){return msg.indexOf("ChunkLoadError")>=0||msg.indexOf("Loading chunk")>=0||msg.indexOf("Failed to fetch dynamically imported module")>=0||msg.indexOf("Failed to load module script")>=0;}function isChunkScriptUrl(url){return typeof url==="string"&&url.indexOf("/_next/static/chunks/")>=0;}function isChunkSignal(ev){var msg=msgFromEvent(ev);if(isChunkMessage(msg))return true;var scriptUrl=scriptUrlFromEvent(ev);if(scriptUrl&&isChunkScriptUrl(scriptUrl))return true;return false;}function reloadWithCacheBuster(){if(count>=3&&now-last<2*60*1000)return;setState();try{var u=new URL(window.location.href);u.searchParams.set("__chunkfix",String(Date.now()));window.location.replace(u.toString());}catch(e){try{window.location.reload();}catch(_){}}}function handler(ev){if(isChunkSignal(ev)){reloadWithCacheBuster();}}window.addEventListener("error",handler,true);window.addEventListener("unhandledrejection",handler);setTimeout(resetState,30000);}catch(e){}})();`,
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
            __html: `(function(){var markReady=function(){document.documentElement.setAttribute('data-app-ready','1');try{var url=new URL(window.location.href);if(url.searchParams.has('__chunkfix')){url.searchParams.delete('__chunkfix');window.history.replaceState(window.history.state,'',url.toString());}}catch(e){}};if(document.readyState==='complete'){markReady();}else{window.addEventListener('load',markReady);}})();`,
          }}
        />
      </body>
    </html>
  );
}
