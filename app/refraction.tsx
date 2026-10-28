// Liquid-glass refraction for the nav pill: an SVG filter that bends the
// backdrop near the pill's edges like a lens, then frosts it. Only Chromium
// renders `backdrop-filter: url(#…)` (Safari and Firefox drop the whole
// backdrop), so nav.tsx opts in per browser via <html data-refraction>; every
// other browser keeps the plain .glass blur.

// Displacement map, stretched over the pill: red = x offset, green = y offset,
// 50% gray = no offset. A blurred gray center keeps the middle undistorted
// so only a thin rim refracts.
const MAP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
<defs>
<linearGradient id="r" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#f00"/></linearGradient>
<linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#0f0"/></linearGradient>
<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
</defs>
<rect width="100" height="100" fill="url(#r)"/>
<rect width="100" height="100" fill="url(#g)" style="mix-blend-mode:screen"/>
<rect x="4" y="22" width="92" height="56" rx="6" fill="#808080" filter="url(#b)"/>
</svg>`;

const MAP_URI = `data:image/svg+xml,${encodeURIComponent(MAP)}`;

export function RefractionFilter() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute" focusable="false">
      <filter
        id="delta-refract"
        x="0"
        y="0"
        width="1"
        height="1"
        colorInterpolationFilters="sRGB"
      >
        <feImage
          href={MAP_URI}
          x="0"
          y="0"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          result="map"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale="28"
          xChannelSelector="R"
          yChannelSelector="G"
          result="bent"
        />
        <feGaussianBlur in="bent" stdDeviation="8" result="frost" />
        <feColorMatrix in="frost" type="saturate" values="1.7" />
      </filter>
    </svg>
  );
}
