/**
 * Exercise 1 - the note that closed the script tag.
 *
 * Escaping the text is not escaping the element. JSON inside `<script>` is parsed by the HTML parser
 * first, and it stops at `</script`; the rest of the note becomes markup and the file is a different
 * document from the one the author wrote.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

/** The bug: escape the text for HTML and hope the script is fine. */
export function byHtmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The repair: JSON first, then the three characters the script element cannot contain raw. */
export function forScript(text: string): string {
  const json = JSON.stringify({ title: text });
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

const NASTY = '</script><img src=x onerror="alert(1)">';

export const checks: readonly Check[] = [
  { name: "the HTML escape leaves the closing tag readable as text", run: () => expect(byHtmlEscape(NASTY).includes("&lt;/script"), "escaped") },
  { name: "the script escape contains no closing tag", run: () => expect(!forScript(NASTY).includes("</script"), "raw tag") },
  { name: "the script escape is still valid JSON", run: () => eq(JSON.parse(forScript(NASTY)).title, NASTY, "round trip") },
  { name: "a plain title is unchanged when parsed", run: () => eq(JSON.parse(forScript("Groceries")).title, "Groceries", "plain") },
  { name: "an ampersand is escaped for the script but not for JSON", run: () => expect(forScript("a & b").includes("\\u0026"), "amp") },
  { name: "a quote survives the round trip", run: () => eq(JSON.parse(forScript(`a "quoted" title`)).title, `a "quoted" title`, "quote") },
  { name: "the escaped form has no raw angle bracket", run: () => expect(!/[<>]/.test(forScript(NASTY)), "raw bracket") },
  { name: "two titles that differ only in case differ in bytes", run: () => expect(forScript("Note") !== forScript("note"), "case") },
];

export function main(): number {
  console.log(`html escape       ${byHtmlEscape(NASTY).slice(0, 40)}`);
  console.log(`script escape     ${forScript(NASTY).slice(0, 40)}`);
  console.log("");
  console.log("the HTML parser reads the script element before JSON ever sees it");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
