// File: components/header/Logo.tsx
// Desc: Brand logo SVG as a React component for inline use and styling.
import * as React from "react";
const Logo: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 500 500"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <g transform="translate(250,250)">
      {/* ROYGBIV colored petals */}
      <g fill="red" transform="rotate(0) translate(0,-280)">
        <path d="M0,90 C36,105 72,135 64,165 C46,200 16,220 2,228 Q-64,208 0,90Z" />
      </g>
      <g fill="darkorange" transform="rotate(51.43) translate(0,-280)">
        <path d="M0,90 C36,105 72,135 64,165 C46,200 16,220 2,228 Q-64,208 0,90Z" />
      </g>
      <g fill="orange" transform="rotate(102.86) translate(0,-280)">
        <path d="M0,90 C36,105 72,135 64,165 C46,200 16,220 2,228 Q-64,208 0,90Z" />
      </g>
      <g fill="green" transform="rotate(154.29) translate(0,-280)">
        <path d="M0,90 C36,105 72,135 64,165 C46,200 16,220 2,228 Q-64,208 0,90Z" />
      </g>
      <g fill="blue" transform="rotate(205.71) translate(0,-280)">
        <path d="M0,90 C36,105 72,135 64,165 C46,200 16,220 2,228 Q-64,208 0,90Z" />
      </g>
      <g fill="purple" transform="rotate(257.14) translate(0,-280)">
        <path d="M0,90 C36,105 72,135 64,165 C46,200 16,220 2,228 Q-64,208 0,90Z" />
      </g>
      <g fill="indigo" transform="rotate(308.57) translate(0,-280)">
        <path d="M0,90 C36,105 72,135 64,165 C46,200 16,220 2,228 Q-64,208 0,90Z" />
      </g>
    </g>
  </svg>
);
export default Logo;