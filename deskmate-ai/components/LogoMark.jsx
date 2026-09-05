// The Deskmate AI mark: a dark circle with an orbit ring and three
// satellite dots around a white center — used at every size from the
// 16px favicon up to the sign-in page. Kept as inline SVG (not a
// raster image) so it stays crisp everywhere instead of blurring when
// scaled, and so its colors can share the app's actual emerald scale.
export default function LogoMark({ size = 32, className = "" }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="32" fill="#064E3B" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx="32" cy="14" r="5" fill="#A7F3D0" />
      <circle cx="19" cy="41" r="4.5" fill="#6EE7B7" />
      <circle cx="45" cy="41" r="5" fill="#34D399" />
      <circle cx="32" cy="32" r="7" fill="#ffffff" />
    </svg>
  );
}
