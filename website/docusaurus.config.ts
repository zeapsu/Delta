import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

// The docs themselves live in ../docs so they also read fine on GitHub.
// Plain .md files are parsed as CommonMark (markdown.format "detect"), so
// placeholders like <agent-name> don't need escaping.
const config: Config = {
  title: "Delta",
  tagline: "A self-hosted personal finance dashboard your own agent can talk to",
  favicon: "img/favicon.svg",

  url: "https://zeapsu.github.io",
  baseUrl: "/Delta/",
  organizationName: "zeapsu",
  projectName: "Delta",
  trailingSlash: false,

  onBrokenLinks: "throw",
  markdown: {
    format: "detect",
    hooks: { onBrokenMarkdownLinks: "throw" },
  },

  i18n: { defaultLocale: "en", locales: ["en"] },

  // Geist, the app's typeface (next/font loads it there).
  headTags: [
    { tagName: "link", attributes: { rel: "preconnect", href: "https://fonts.googleapis.com" } },
    { tagName: "link", attributes: { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "anonymous" } },
  ],
  stylesheets: [
    "https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap",
  ],

  presets: [
    [
      "classic",
      {
        docs: {
          path: "../docs",
          routeBasePath: "docs",
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/zeapsu/Delta/edit/main/",
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  // Old doc URLs. The Update pill in builds before the rename links to
  // /docs/one-click-install#update; the redirect page keeps the hash.
  plugins: [
    [
      "@docusaurus/plugin-client-redirects",
      { redirects: [{ from: "/docs/one-click-install", to: "/docs/home-server" }] },
    ],
  ],

  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: "Delta",
      items: [
        { type: "docSidebar", sidebarId: "docs", position: "left", label: "Docs" },
        { href: "https://github.com/zeapsu/Delta", label: "GitHub", position: "right", className: "header-github" },
      ],
    },
    footer: {
      links: [
        {
          title: "Docs",
          items: [
            { label: "Introduction", to: "/docs" },
            { label: "Home server app", to: "/docs/home-server" },
            { label: "Self-hosting", to: "/docs/self-hosting" },
            { label: "Plaid Trial setup", to: "/docs/plaid-trial" },
            { label: "Connect an agent", to: "/docs/agents" },
          ],
        },
        {
          title: "Reference",
          items: [
            { label: "MCP tools", to: "/docs/mcp-tools" },
            { label: "REST API", to: "/docs/api" },
            { label: "Architecture", to: "/docs/architecture" },
            { label: "Troubleshooting", to: "/docs/troubleshooting" },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "GitHub", href: "https://github.com/zeapsu/Delta" },
            { label: "Contributing", href: "https://github.com/zeapsu/Delta/blob/main/CONTRIBUTING.md" },
            { label: "Issues", href: "https://github.com/zeapsu/Delta/issues" },
            { label: "License (AGPL-3.0)", href: "https://github.com/zeapsu/Delta/blob/main/LICENSE.md" },
          ],
        },
      ],
      copyright: "Delta is free, open source and self-hosted. Your data is stored on your machine.",
    },
    prism: {
      // Code blocks sit on the card's own fill, so the themes' backgrounds go.
      theme: { ...prismThemes.github, plain: { ...prismThemes.github.plain, backgroundColor: "transparent" } },
      darkTheme: { ...prismThemes.vsDark, plain: { ...prismThemes.vsDark.plain, backgroundColor: "transparent" } },
      additionalLanguages: ["bash", "json"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
