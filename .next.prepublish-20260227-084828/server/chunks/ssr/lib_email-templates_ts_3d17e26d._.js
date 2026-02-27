module.exports=[973365,a=>{"use strict";let b=/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;function c(a){let c,d=new Set;for(;c=b.exec(a);){let a=c[1]?.trim();a&&d.add(a)}return Array.from(d.values()).sort((a,b)=>a.localeCompare(b))}a.s(["collectMacros",()=>c])}];

//# sourceMappingURL=lib_email-templates_ts_3d17e26d._.js.map