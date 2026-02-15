declare module "next/dist/compiled/node-html-parser" {
  // Next ships a compiled copy of node-html-parser without TypeScript types.
  // For our simple extraction use-cases, `any` is sufficient.
  export const parse: (html: string) => any;
  const mod: any;
  export default mod;
}

