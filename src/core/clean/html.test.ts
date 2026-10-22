import { describe, expect, it } from "vitest";
import { htmlToText, sanitizeDescriptionHtml } from "./html";

const VOID_TAGS = new Set(["br"]);

/** True when every opened tag is closed in order (what EC-B12 asks of the sanitiser). */
function isBalanced(html: string): boolean {
  const stack: string[] = [];
  for (const match of html.matchAll(/<(\/?)([a-z][a-z0-9]*)[^>]*>/gi)) {
    const name = match[2].toLowerCase();
    if (VOID_TAGS.has(name)) continue;
    if (match[1] === "/") {
      if (stack.pop() !== name) return false;
    } else {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

describe("sanitizeDescriptionHtml", () => {
  it.each([null, undefined, "", "   ", "n/a", "-", "TBD"])("returns an empty result for %j", (input) => {
    expect(sanitizeDescriptionHtml(input)).toEqual({ html: null, text: null, unsafeRemoved: false, issues: [] });
  });

  it("EC-B11: strips scripts and event handlers and records it", () => {
    const result = sanitizeDescriptionHtml('<script>alert(1)</script><p onclick="x">Hi</p>');
    expect(result.html).toBe("<p>Hi</p>");
    expect(result.text).toBe("Hi");
    expect(result.unsafeRemoved).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ code: "html.unsafe_removed", severity: "warn", ec: "B11" });
  });

  it("EC-B11: drops javascript: links but keeps their text", () => {
    const result = sanitizeDescriptionHtml('<a href="javascript:alert(1)">x</a>');
    expect(result.unsafeRemoved).toBe(true);
    expect(result.html).not.toContain("href");
    expect(result.html).not.toMatch(/javascript/i);
    expect(result.text).toBe("x");
    expect(result.issues.map((i) => i.code)).toContain("html.unsafe_removed");
  });

  it.each([
    ['<iframe src="https://x"></iframe><p>a</p>', "iframe"],
    ['<object data="x"></object><p>a</p>', "object"],
    ['<embed src="x"><p>a</p>', "embed"],
    ['<form action="x"><p>a</p></form>', "form"],
    ["<style>p{display:none}</style><p>a</p>", "style"],
    ['<link rel="stylesheet" href="x"><p>a</p>', "link"],
    ['<meta http-equiv="refresh" content="0"><p>a</p>', "meta"],
    ['<iframe srcdoc="&lt;script&gt;"></iframe><p>a</p>', "srcdoc"],
    ['<p onmouseover="steal()">a</p>', "onmouseover"],
    ["<img src=x onerror=alert(1)><p>a</p>", "onerror"],
    ['<a href="vbscript:x">a</a>', "vbscript"],
    ['<a href="data:text/html;base64,AAAA">a</a>', "data:text/html"],
    ["<SCRIPT SRC=x></SCRIPT><p>a</p>", "SCRIPT"],
  ])("EC-B11: flags and removes %j", (input, marker) => {
    const result = sanitizeDescriptionHtml(input);
    expect(result.unsafeRemoved).toBe(true);
    expect(result.html ?? "").not.toMatch(/<(script|iframe|object|embed|form|style|link|meta|img)/i);
    expect(result.html ?? "").not.toMatch(/\son[a-z]+\s*=/i);
    expect(result.html ?? "").not.toMatch(/javascript:|vbscript:|data:/i);
    expect((result.html ?? "").toLowerCase()).not.toContain(marker.toLowerCase().replace(/^on.*/, "on"));
    expect(result.text).toBe("a");
  });

  it("EC-B11: drops base64 images as unsupported markup", () => {
    const result = sanitizeDescriptionHtml('<img src="data:image/png;base64,AAAA"><p>ok</p>');
    expect(result.html).toBe("<p>ok</p>");
    expect(result.unsafeRemoved).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ code: "html.tags_stripped", severity: "info" });
  });

  it("EC-B11: returns null when only unsafe content was present", () => {
    const result = sanitizeDescriptionHtml("<script>x()</script>");
    expect(result.html).toBeNull();
    expect(result.text).toBeNull();
    expect(result.unsafeRemoved).toBe(true);
  });

  it.each([
    ["<p>unclosed <b>bold", "<p>unclosed <b>bold</b></p>"],
    ["<ul><li>a<li>b</ul>", "<ul><li>a</li><li>b</li></ul>"],
    ["<p>a<p>b", "<p>a</p><p>b</p>"],
    ["<p>a</b></i>", "<p>a</p>"],
  ])("EC-B12: broken HTML %j comes out well-formed", (input, expected) => {
    const result = sanitizeDescriptionHtml(input);
    expect(result.html).toBe(expected);
    expect(isBalanced(result.html ?? "")).toBe(true);
    expect(result.unsafeRemoved).toBe(false);
  });

  it("turns plain text with blank lines into paragraphs with line breaks", () => {
    const result = sanitizeDescriptionHtml("Line one\nLine two\n\nSecond para & more");
    expect(result.html).toBe("<p>Line one<br />Line two</p><p>Second para &amp; more</p>");
    expect(result.text).toBe("Line one\nLine two\nSecond para & more");
    expect(result.unsafeRemoved).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it.each([
    ['Tom & Jerry <3 "quoted"', "<p>Tom &amp; Jerry &lt;3 &quot;quoted&quot;</p>", 'Tom & Jerry <3 "quoted"'],
    ["Tom &amp; Jerry", "<p>Tom &amp; Jerry</p>", "Tom & Jerry"],
    ["size > 20 cm", "<p>size &gt; 20 cm</p>", "size > 20 cm"],
    ["Call javascript: never", "<p>Call javascript: never</p>", "Call javascript: never"],
  ])("escapes plain text %j", (input, html, text) => {
    const result = sanitizeDescriptionHtml(input);
    expect(result.html).toBe(html);
    expect(result.text).toBe(text);
    expect(result.unsafeRemoved).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it("decodes entities in the text projection", () => {
    const result = sanitizeDescriptionHtml("<p>Tom &amp; Jerry &lt;3 &quot;hi&quot; &#39;x&#39; &#8364;5 &#x20AC; &nbsp;end</p>");
    expect(result.text).toBe("Tom & Jerry <3 \"hi\" 'x' €5 € end");
    expect(result.html).toContain("&amp;");
  });

  it("strips harmless tags, keeps their text and records an info issue", () => {
    const result = sanitizeDescriptionHtml('<div class="x"><span style="color:red">Hello</span></div>');
    expect(result.html).toBe("<p>Hello</p>");
    expect(result.text).toBe("Hello");
    expect(result.unsafeRemoved).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ code: "html.tags_stripped", severity: "info" });
  });

  it("keeps tables but strips their attributes", () => {
    const result = sanitizeDescriptionHtml('<table border="1" cellpadding="2"><tr><td>1</td><td>2</td></tr></table>');
    expect(result.html).toBe("<table><tr><td>1</td><td>2</td></tr></table>");
    expect(result.issues.map((i) => i.code)).toEqual(["html.tags_stripped"]);
  });

  it("renames headings and divs without reporting them as stripped", () => {
    const result = sanitizeDescriptionHtml("<h1>a</h1><h5>b</h5><h6>c</h6><div>d</div>");
    expect(result.html).toBe("<h2>a</h2><h4>b</h4><h4>c</h4><p>d</p>");
    expect(result.issues).toEqual([]);
  });

  it("keeps http(s) links with safe rel/target and drops other schemes", () => {
    const result = sanitizeDescriptionHtml('<a href="https://x.com" title="t">l</a><a href="//evil">e</a><a href="ftp://x">f</a>');
    expect(result.html).toBe('<a href="https://x.com" title="t" rel="noopener noreferrer" target="_blank">l</a>ef');
    expect(result.unsafeRemoved).toBe(false);
  });

  it("removes comments, XML prologues and doctypes", () => {
    const result = sanitizeDescriptionHtml('<?xml version="1.0"?><!DOCTYPE html><!-- hidden --><p>Visible</p>');
    expect(result.html).toBe("<p>Visible</p>");
    expect(result.text).toBe("Visible");
    expect(result.issues).toEqual([]);
  });

  it("discards the content of style and textarea and noscript", () => {
    const result = sanitizeDescriptionHtml("<p>a</p><textarea>ta</textarea><noscript>ns</noscript>");
    expect(result.text).toBe("a");
  });

  it("EC-B16: preserves emoji, CJK and right-to-left text", () => {
    const result = sanitizeDescriptionHtml("<p>🌿 陶器の鉢 مزهرية</p>");
    expect(result.html).toBe("<p>🌿 陶器の鉢 مزهرية</p>");
    expect(result.text).toBe("🌿 陶器の鉢 مزهرية");
  });

  it.each(["<<<>>>", "<p", "&;", "<!--", "<p><", "</p></p></b>", "<a href=\"", "<".repeat(500), "<p>".repeat(300) + "x"])(
    "never throws on garbage %j",
    (input) => {
      expect(() => sanitizeDescriptionHtml(input)).not.toThrow();
      const result = sanitizeDescriptionHtml(input);
      expect(typeof result.unsafeRemoved).toBe("boolean");
      expect(Array.isArray(result.issues)).toBe(true);
    },
  );
});

describe("htmlToText", () => {
  it("turns block boundaries into newlines and cells into spaces", () => {
    const html = "<h2>T</h2><ul><li>a</li><li>b</li></ul><p>c<br>d</p><table><tr><td>1</td><td>2</td></tr></table>";
    expect(htmlToText(html)).toBe("T\na\nb\nc\nd\n1 2");
  });

  it("decodes named, decimal and hex entities", () => {
    const html = "a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39; &apos;g&apos; h&nbsp;i &#8364; &#x20AC; &hellip; &unknown;";
    expect(htmlToText(html)).toBe("a & b < c > d \"e\" 'f' 'g' h i € € … &unknown;");
  });

  it("decodes only once", () => {
    expect(htmlToText("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
  });

  it("leaves invalid numeric entities alone", () => {
    expect(htmlToText("&#xD800; &#0; &#1114112;")).toBe("&#xD800; &#0; &#1114112;");
  });

  it("drops comments, prologues and script content", () => {
    expect(htmlToText('<!-- c --><?xml version="1.0"?><script>bad()</script><style>p{}</style><p>ok</p>')).toBe("ok");
  });

  it("keeps a stray less-than that is not a tag", () => {
    expect(htmlToText("<p>a < b</p>")).toBe("a < b");
  });

  it("returns an empty string for empty input", () => {
    expect(htmlToText("")).toBe("");
  });
});
