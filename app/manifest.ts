import type { MetadataRoute } from "next";

// Lets "Add to Home Screen" install Delta with its icon, full screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Delta",
    short_name: "Delta",
    description: "Personal finance dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
