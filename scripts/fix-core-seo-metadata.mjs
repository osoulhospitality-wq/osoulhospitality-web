import fs from "node:fs";

const domain = "https://osoulhospitality.com";
const pages = [
  "solutions",
  "outputs",
  "about",
  "scenarios",
  "contact",
  "privacy",
  "terms",
  "accessibility",
];

function replaceOnce(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error(`${label}: expected one match, found ${matches?.length ?? 0}`);
  }
  return source.replace(pattern, replacement);
}

for (const slug of pages) {
  const file = `${slug}/index.html`;
  let html = fs.readFileSync(file, "utf8");
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"\/>/)?.[1];
  if (!title || !description) throw new Error(`${file}: title or description missing`);

  const canonical = `${domain}/${slug}/`;
  html = html.replace(/<link rel="alternate" hreflang="(?:ar-SA|en-SA|x-default)" href="[^"]+"\/>/g, "");
  html = replaceOnce(html, /<meta property="og:title" content="[^"]+"\/>/, `<meta property="og:title" content="${title}"/>`, `${file} og:title`);
  html = replaceOnce(html, /<meta property="og:description" content="[^"]+"\/>/, `<meta property="og:description" content="${description}"/>`, `${file} og:description`);
  html = replaceOnce(html, /<meta property="og:url" content="[^"]+"\/>/, `<meta property="og:url" content="${canonical}"/>`, `${file} og:url`);
  html = replaceOnce(html, /<meta name="twitter:title" content="[^"]+"\/>/, `<meta name="twitter:title" content="${title}"/>`, `${file} twitter:title`);
  html = replaceOnce(html, /<meta name="twitter:description" content="[^"]+"\/>/, `<meta name="twitter:description" content="${description}"/>`, `${file} twitter:description`);
  html = replaceOnce(
    html,
    /<link rel="canonical" href="[^"]+"\/>/,
    `<link rel="canonical" href="${canonical}"/><link rel="alternate" hreflang="ar-SA" href="${canonical}"/><link rel="alternate" hreflang="en-SA" href="${domain}/en/${slug}/"/><link rel="alternate" hreflang="x-default" href="${canonical}"/>`,
    `${file} canonical`,
  );
  fs.writeFileSync(file, html);
}

{
  const file = "thank-you/index.html";
  let html = fs.readFileSync(file, "utf8");
  const canonical = `${domain}/thank-you/`;
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"\/>/)?.[1];
  if (!title || !description) throw new Error(`${file}: title or description missing`);
  html = replaceOnce(html, /<meta property="og:title" content="[^"]+"\/>/, `<meta property="og:title" content="${title}"/>`, `${file} og:title`);
  html = replaceOnce(html, /<meta property="og:description" content="[^"]+"\/>/, `<meta property="og:description" content="${description}"/>`, `${file} og:description`);
  html = replaceOnce(html, /<meta property="og:url" content="[^"]+"\/>/, `<meta property="og:url" content="${canonical}"/>`, `${file} og:url`);
  html = replaceOnce(html, /<link rel="canonical" href="[^"]+"\/>/, `<link rel="canonical" href="${canonical}"/>`, `${file} canonical`);
  if (!html.includes("/site-hostinger-v16.js")) {
    html = replaceOnce(html, /\/site-hostinger-v15\.js/, "/site-hostinger-v16.js", `${file} runtime`);
  }
  fs.writeFileSync(file, html);
}

