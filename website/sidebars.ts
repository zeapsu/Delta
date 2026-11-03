import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "intro",
    { type: "category", label: "Run Delta", collapsed: false, items: ["home-server", "self-hosting", "plaid-trial", "updating", "uninstalling", "troubleshooting"] },
    { type: "category", label: "Agents", collapsed: false, items: ["agents", "mcp-tools", "api"] },
    { type: "category", label: "Contribute", collapsed: false, items: [
      "architecture",
      { type: "link", label: "Contributing guide", href: "https://github.com/zeapsu/Delta/blob/main/CONTRIBUTING.md" },
    ] },
  ],
};

export default sidebars;
