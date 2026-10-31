import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

// The docs themselves live in ../docs so they also read fine on GitHub.
// Plain .md files are parsed as CommonMark (markdown.format "detect"), so
// placeholders like <agent-name> don't need escaping.
const config: Config = {
  title: "Delta",
  tagline: "A self-hosted personal finance dashboard your own agent can talk to",
  favicon: "img/favicon.ico",

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

  presets: [
    [
      "classic",
      {
        docs: {
          path: "../docs",
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/zeapsu/Delta/edit/main/",
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: "Delta",
      items: [
        { type: "docSidebar", sidebarId: "docs", position: "left", label: "Docs" },
        { href: "https://github.com/zeapsu/Delta", label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Introduction", to: "/" },
            { label: "Self-hosting", to: "/self-hosting" },
            { label: "Connect an agent", to: "/agents" },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "GitHub", href: "https://github.com/zeapsu/Delta" },
            { label: "Contributing", href: "https://github.com/zeapsu/Delta/blob/main/CONTRIBUTING.md" },
            { label: "Issues", href: "https://github.com/zeapsu/Delta/issues" },
          ],
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
