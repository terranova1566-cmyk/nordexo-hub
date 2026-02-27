module.exports=[179571,a=>{"use strict";a.s(["default",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call the default export of [project]/components/providers.tsx <module evaluation> from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/components/providers.tsx <module evaluation>","default")},534062,a=>{"use strict";a.s(["default",()=>b]);let b=(0,a.i(211857).registerClientReference)(function(){throw Error("Attempted to call the default export of [project]/components/providers.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.")},"[project]/components/providers.tsx","default")},917950,a=>{"use strict";a.i(179571);var b=a.i(534062);a.n(b)},233290,a=>{"use strict";var b=a.i(907997),c=a.i(917950);function d({children:a}){return(0,b.jsxs)("html",{lang:"en","data-app-ready":"0",children:[(0,b.jsxs)("head",{children:[(0,b.jsx)("style",{children:`
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
        `}),(0,b.jsx)("script",{dangerouslySetInnerHTML:{__html:'(function(){try{var KEY="__nordexo_chunk_reload_ts__";var now=Date.now();var last=0;try{last=parseInt(sessionStorage.getItem(KEY)||"0",10)||0;}catch(e){}var canReload=!last||now-last>5*60*1000;function mark(){try{sessionStorage.setItem(KEY,String(Date.now()));}catch(e){}}function isChunkError(msg){if(!msg)return false;msg=String(msg);return msg.indexOf("ChunkLoadError")>=0||msg.indexOf("Loading chunk")>=0||msg.indexOf("Failed to fetch dynamically imported module")>=0;}function handler(ev){var msg="";try{msg=(ev&&ev.message)||"";}catch(e){}if(!msg){try{msg=(ev&&ev.reason&&ev.reason.message)||ev&&ev.reason||"";}catch(e){}}if(isChunkError(msg)&&canReload){mark();try{window.location.reload();}catch(e){}}}window.addEventListener("error",handler);window.addEventListener("unhandledrejection",handler);}catch(e){}})();'}})]}),(0,b.jsxs)("body",{children:[(0,b.jsx)("div",{id:"app-preload","aria-hidden":"true",children:(0,b.jsx)("div",{className:"app-preload-spinner",role:"status","aria-label":"Loading"})}),(0,b.jsx)(c.default,{children:a}),(0,b.jsx)("script",{dangerouslySetInnerHTML:{__html:"(function(){var markReady=function(){document.documentElement.setAttribute('data-app-ready','1');};if(document.readyState==='complete'){markReady();}else{window.addEventListener('load',markReady);}})();"}})]})]})}a.s(["default",()=>d,"metadata",0,{title:"Product Manager",description:"Partner portal for searching, saving, and exporting products.",icons:{icon:"/brand/LogoIcon.png"}}])}];

//# sourceMappingURL=_f2037052._.js.map