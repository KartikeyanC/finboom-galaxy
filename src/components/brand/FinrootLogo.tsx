/**
 * FinRoot brand mark — Figma export (40×40 canvas).
 * Inner mark scaled to 78% and centred to give proper padding inside the chip.
 */
export function FinrootLogo({
  className,
  bg = "#377861",
  stroke = "#ffffff",
}: {
  className?: string;
  bg?: string;
  stroke?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label="FinRoot"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      {/* rounded-square background */}
      <path
        d="M32.165 0H7.83502C3.50786 0 0 3.50786 0 7.83502V32.165C0 36.4921 3.50786 40 7.83502 40H32.165C36.4921 40 40 36.4921 40 32.165V7.83502C40 3.50786 36.4921 0 32.165 0Z"
        fill={bg}
      />

      {/* mark scaled to 78% around the centre point (20,20) for padding */}
      <g transform="translate(20 20) scale(0.78) translate(-20 -20)">
        <path
          d="M8.31127 34.0967C8.13887 31.3116 8.20223 25.8923 11.039 20.0412C12.0303 17.9961 14.1818 13.6935 19.0378 10.2391C23.6473 6.96011 28.3214 6.13347 30.8888 5.90547C31.3396 5.86539 31.7297 6.21536 31.7387 6.6679C31.7849 8.98535 31.4948 13.3694 28.8864 17.9603C26.0833 22.8943 22.1315 25.3756 20.4023 26.3289"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11.11 34.0966C10.935 31.6848 10.9191 26.7904 13.455 21.4629C14.3567 19.5683 16.7211 14.7661 22.165 11.4613C24.5708 10.0007 26.8516 9.27314 28.5096 8.89042C28.7557 8.83353 28.9837 9.03868 28.9527 9.28952C28.7187 11.1816 28.0204 14.4455 25.7064 17.6827C23.2812 21.0754 20.1691 22.9162 17.8417 23.8984C16.6043 24.4208 16.2134 25.9857 17.0642 27.0249C17.5581 27.6283 18.058 28.3243 18.5283 29.1199C19.6704 31.0529 20.2096 32.8515 20.4807 34.097"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export default FinrootLogo;
