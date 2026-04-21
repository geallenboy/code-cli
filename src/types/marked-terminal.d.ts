declare module 'marked-terminal' {
  import type { MarkedExtension } from 'marked';

  interface MarkedTerminalOptions {
    code?: (code: string, lang?: string, escaped?: boolean) => string;
    blockquote?: (quote: string) => string;
    html?: (html: string) => string;
    heading?: (text: string, level: number) => string;
    firstHeading?: (text: string, level: number) => string;
    hr?: () => string;
    list?: (body: string, ordered: boolean) => string;
    listitem?: (text: string) => string;
    checkbox?: (checked: boolean) => string;
    paragraph?: (text: string) => string;
    table?: (header: string, body: string) => string;
    tablerow?: (content: string) => string;
    tablecell?: (content: string, flags: object) => string;
    strong?: (text: string) => string;
    em?: (text: string) => string;
    codespan?: (text: string) => string;
    br?: () => string;
    del?: (text: string) => string;
    link?: (href: string, title: string, text: string) => string;
    image?: (href: string, title: string, text: string) => string;
    reflowText?: boolean;
    width?: number;
    showSectionPrefix?: boolean;
    unescape?: boolean;
    tab?: number;
    emoji?: boolean;
  }

  export default function markedTerminal(
    options?: MarkedTerminalOptions,
  ): MarkedExtension;
}
