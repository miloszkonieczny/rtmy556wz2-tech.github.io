import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LANGUAGE_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  SAVED_STORIES_KEY,
} from "../assets/scripts/core/config.js";
import { deleteMoonTaleBrowserData } from "../assets/scripts/core/browser-data.js";
import {
  buildMinimalWaitlistPayload,
  MINIMAL_WAITLIST_FIELDS,
} from "../assets/scripts/services/formspree.js";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function readProjectFile(filePath) {
  return readFileSync(join(repoRoot, filePath), "utf8");
}

function walkFiles(dir, predicate, root = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".git") return [];
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath, predicate, root);
    const relativePath = fullPath.slice(root.length + 1);
    return predicate(relativePath) ? [relativePath] : [];
  });
}

const publicPages = [
  "index.html",
  "story-builder.html",
  "story.html",
  "personalized-bedtime-stories-for-kids.html",
];

const legalRoutes = [
  "legal/index.html",
  "legal/privacy/index.html",
  "legal/terms/index.html",
  "legal/cookies/index.html",
  "legal/legal-notice/index.html",
  "legal/ip-infringement/index.html",
];

const allHtmlPages = [...publicPages, ...legalRoutes];

function resolveLocalReference(fromFile, url) {
  const cleanUrl = url.split("#")[0].split("?")[0];
  if (!cleanUrl || cleanUrl.startsWith("/")) return null;
  const resolved = resolve(dirname(join(repoRoot, fromFile)), cleanUrl);
  return cleanUrl.endsWith("/") ? join(resolved, "index.html") : resolved;
}

function findModuleReferences(filePath) {
  const source = readFileSync(filePath, "utf8");
  const references = [];
  const patterns = [
    /\bimport\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+[^'"]*?\s+from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  patterns.forEach((pattern) => {
    for (const match of source.matchAll(pattern)) {
      references.push(match[1]);
    }
  });

  return references;
}

function isRelativeModuleReference(reference) {
  return reference.startsWith("./") || reference.startsWith("../");
}

test("all six legal routes exist and public pages link to legal basics", () => {
  legalRoutes.forEach((route) => {
    assert.equal(
      statSync(join(repoRoot, route)).isFile(),
      true,
      `${route} exists`,
    );
  });

  allHtmlPages.forEach((page) => {
    const html = readProjectFile(page);
    assert.equal(
      html.includes("legal/privacy/"),
      true,
      `${page} links to privacy`,
    );
    assert.equal(html.includes("legal/terms/"), true, `${page} links to terms`);
    assert.equal(
      html.includes("legal/cookies/"),
      true,
      `${page} links to cookies`,
    );
    assert.match(
      html,
      /data-cookie-settings/,
      `${page} has cookie settings control`,
    );
  });
});

test("public legal pages use verified facts and no public placeholders", () => {
  const legalText = legalRoutes.map(readProjectFile).join("\\n");
  assert.equal(legalText.includes("{{"), false);
  assert.equal(legalText.includes("[FULL LEGAL NAME]"), false);
  assert.match(legalText, /Konieczny Miłosz/);
  assert.match(legalText, /contact@moontaleapp\.com/);
  assert.match(
    legalText,
    /not currently a registered company or separate legal entity/,
  );
});

test("only the sole MoonTale-domain contact email appears in public HTML", () => {
  allHtmlPages.forEach((page) => {
    const html = readProjectFile(page);
    const moontaleEmails = Array.from(
      html.matchAll(/[A-Z0-9._%+-]+@moontaleapp\.com/gi),
    ).map((match) => match[0].toLowerCase());
    assert.ok(
      moontaleEmails.includes("contact@moontaleapp.com"),
      `${page} has the public contact email`,
    );
    moontaleEmails.forEach((email) =>
      assert.equal(
        email,
        "contact@moontaleapp.com",
        `${page} has only the approved MoonTale-domain email`,
      ),
    );
  });
});

test("public HTML does not load Google Analytics directly", () => {
  allHtmlPages.forEach((page) => {
    const html = readProjectFile(page);
    assert.equal(
      html.includes("googletagmanager.com/gtag/js"),
      false,
      `${page} should not load GA directly`,
    );
    assert.equal(
      html.includes('gtag("config"'),
      false,
      `${page} should not configure GA directly`,
    );
  });

  const cookieConsent = readProjectFile(
    "assets/scripts/core/cookie-consent.js",
  );
  assert.match(cookieConsent, /ANALYTICS_ID = "G-716GP23C93"/);
  assert.match(cookieConsent, /loadGoogleAnalytics/);
  assert.match(cookieConsent, /page_path: window\.location\.pathname/);
});

test("story builder supports local story generation without email and requires adult confirmation", () => {
  const html = readProjectFile("story-builder.html");
  assert.match(html, /name="adultAuthorization" type="checkbox" required/);
  assert.match(html, /name="marketingConsent" type="checkbox"/);
  assert.match(html, /Parent email for updates \(optional\)/);
  assert.doesNotMatch(html, /name="email"\\s+required/);
  assert.match(html, /Child's nickname/);

  const builderScript = readProjectFile("assets/scripts/pages/builder.js");
  assert.match(builderScript, /syncMarketingEmailRequirement/);
  assert.match(builderScript, /window\.location\.href = STORY_PAGE_URL/);
  assert.doesNotMatch(builderScript, /encodeProfile/);
});

test("minimal Formspree payload excludes child-profile and story fields", () => {
  const payload = buildMinimalWaitlistPayload({
    email: " parent@example.com ",
    source: "story-builder",
    adultConfirmation: true,
    marketingConsent: true,
    submissionDate: "2026-07-15T00:00:00.000Z",
  });

  assert.deepEqual(Object.keys(payload), MINIMAL_WAITLIST_FIELDS);
  assert.equal(payload.email, "parent@example.com");
  [
    "childNickname",
    "childName",
    "childAge",
    "currentLanguage",
    "targetLanguage",
    "character",
    "mood",
    "interest",
    "goal",
    "readingTime",
    "newWordsCount",
    "generatedStory",
    "profile",
  ].forEach((field) =>
    assert.equal(Object.hasOwn(payload, field), false, `${field} is not sent`),
  );

  const formspreeScript = readProjectFile(
    "assets/scripts/services/formspree.js",
  );
  assert.equal(formspreeScript.includes("new FormData(form)"), false);
});

test("browser-data deletion removes only MoonTale story profile and saved stories", () => {
  const values = new Map([
    [PROFILE_STORAGE_KEY, "profile"],
    [SAVED_STORIES_KEY, "stories"],
    [LANGUAGE_STORAGE_KEY, "pl"],
    ["moontaleCookieConsent", "accepted"],
  ]);
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };

  assert.equal(deleteMoonTaleBrowserData(storage), true);
  assert.equal(values.has(PROFILE_STORAGE_KEY), false);
  assert.equal(values.has(SAVED_STORIES_KEY), false);
  assert.equal(values.get(LANGUAGE_STORAGE_KEY), "pl");
  assert.equal(values.get("moontaleCookieConsent"), "accepted");
});

test("sitemap includes all legal routes", () => {
  const sitemap = readProjectFile("sitemap.xml");
  [
    "https://moontaleapp.com/legal/",
    "https://moontaleapp.com/legal/privacy/",
    "https://moontaleapp.com/legal/terms/",
    "https://moontaleapp.com/legal/cookies/",
    "https://moontaleapp.com/legal/legal-notice/",
    "https://moontaleapp.com/legal/ip-infringement/",
  ].forEach((url) =>
    assert.equal(sitemap.includes(url), true, `sitemap includes ${url}`),
  );
});

test("local scripts, styles and images referenced by HTML exist", () => {
  allHtmlPages.forEach((page) => {
    const html = readProjectFile(page);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = match[1];
      if (/^(https?:|mailto:|#|data:)/.test(url)) continue;
      const cleanUrl = url.split("#")[0].split("?")[0];
      if (!cleanUrl || cleanUrl.startsWith("/")) continue;
      const resolved = resolve(dirname(join(repoRoot, page)), cleanUrl);
      const target = cleanUrl.endsWith("/")
        ? join(resolved, "index.html")
        : resolved;
      assert.equal(
        existsSync(target),
        true,
        `${page} references existing ${url}`,
      );
    }
  });
});

test("local HTML scripts and JavaScript module imports resolve to existing files", () => {
  const entryScripts = new Set();

  allHtmlPages.forEach((page) => {
    const html = readProjectFile(page);
    for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
      const scriptUrl = match[1];
      if (/^(https?:|data:)/.test(scriptUrl)) continue;
      const scriptPath = resolveLocalReference(page, scriptUrl);
      assert.ok(scriptPath, `${page} has a local script path`);
      assert.equal(
        existsSync(scriptPath),
        true,
        `${page} script exists: ${scriptUrl}`,
      );
      entryScripts.add(scriptPath);
    }
  });

  const seenScripts = new Set();
  const pendingScripts = [...entryScripts];

  while (pendingScripts.length > 0) {
    const scriptPath = pendingScripts.pop();
    if (!scriptPath || seenScripts.has(scriptPath)) continue;
    seenScripts.add(scriptPath);

    findModuleReferences(scriptPath).forEach((reference) => {
      if (!isRelativeModuleReference(reference)) return;
      const cleanReference = reference.split("#")[0].split("?")[0];
      const resolvedPath = resolve(dirname(scriptPath), cleanReference);
      assert.equal(
        existsSync(resolvedPath),
        true,
        `${scriptPath} imports existing ${reference}`,
      );
      if (/\.m?js$/.test(resolvedPath)) pendingScripts.push(resolvedPath);
    });
  }

  assert.ok(
    entryScripts.size > 0,
    "HTML pages include local module entrypoints",
  );
  assert.ok(
    seenScripts.size >= entryScripts.size,
    "module graph was traversed",
  );
});

test("no public HTML references a missing legacy script", () => {
  allHtmlPages.forEach((page) => {
    assert.equal(
      readProjectFile(page).includes("script.js"),
      false,
      `${page} does not use legacy script.js`,
    );
  });
});

test("story generation is self-contained and does not depend on removed browser globals", () => {
  const storyHtml = readProjectFile("story.html");
  const generatorScript = readProjectFile(
    "assets/scripts/services/story-generator.js",
  );
  const storyPageScript = readProjectFile("assets/scripts/pages/story.js");

  assert.equal(storyHtml.includes("stories.js"), false);
  assert.equal(storyHtml.includes("story-engine.js"), false);
  assert.equal(storyHtml.includes("vocabulary/"), false);
  assert.equal(generatorScript.includes("window.MoonTaleStories"), false);
  assert.equal(storyPageScript.includes("writeCurrentLanguage"), false);
  assert.match(
    generatorScript,
    /from "\.\.\/\.\.\/\.\.\/data\/story-content\.js"/,
  );
  assert.match(generatorScript, /from "\.\/vocabulary\.js"/);
});
