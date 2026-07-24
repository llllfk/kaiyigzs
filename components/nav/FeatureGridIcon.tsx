"use client";

import { cn } from "@/lib/utils";

/** 功能页 / 底栏用的线框图标 */
export function FeatureGridIcon({
  href,
  className,
  size = 28,
}: {
  href: string;
  className?: string;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    "aria-hidden": true as const,
    className: cn("shrink-0", className),
  };

  switch (href) {
    case "/dashboard":
      return (
        <svg {...common}>
          <path
            d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5.5v-6h-3v6H5a1 1 0 0 1-1-1v-9.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "/customers":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M5 19.5a7 7 0 0 1 14 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "/apps":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "/tasks":
      return (
        <svg {...common}>
          <path
            d="M8 6h11M8 12h11M8 18h11"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M4.5 6.2l1 1 2-2.2M4.5 12.2l1 1 2-2.2M4.5 18.2l1 1 2-2.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "/notifications":
      return (
        <svg {...common}>
          <path
            d="M6.5 17h11V11a5.5 5.5 0 1 0-11 0v6Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M10 19.5a2 2 0 0 0 4 0M12 3.5V5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "/pool":
      return (
        <svg {...common}>
          <path
            d="M4 14c2-3 4-4.5 8-4.5S18 11 20 14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M4 18c2-3 4-4.5 8-4.5S18 15 20 18"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "/opportunities":
      return (
        <svg {...common}>
          <path
            d="M4 19V5M4 19h16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M8 15l3-4 3 2 4-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "/quotes":
      return (
        <svg {...common}>
          <path
            d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M14 3.5V8h4.5" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M9 12h6M9 16h4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "/knowledge":
      return (
        <svg {...common}>
          <path
            d="M5 5.5A2.5 2.5 0 0 1 7.5 3H12v16H7.5A2.5 2.5 0 0 0 5 21.5v-16Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M19 5.5A2.5 2.5 0 0 0 16.5 3H12v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "/competitors":
      return (
        <svg {...common}>
          <circle cx="8" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="16" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "/insights":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M16 16l4.5 4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "/reports":
      return (
        <svg {...common}>
          <rect
            x="4"
            y="3.5"
            width="16"
            height="17"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M8 16v-4M12 16V8M16 16v-6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "/uploads":
      return (
        <svg {...common}>
          <path
            d="M12 16V7m0 0 3.5 3.5M12 7 8.5 10.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "/voices/records":
      return (
        <svg {...common}>
          <rect
            x="9"
            y="3.5"
            width="6"
            height="11"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M6 11a6 6 0 0 0 12 0M12 17v3.5M9 20.5h6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "/team":
      return (
        <svg {...common}>
          <path
            d="M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M3.5 19a4.5 4.5 0 0 1 9 0M11.5 19a4.5 4.5 0 0 1 9 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "/audit":
    case "/audit-logs":
      return (
        <svg {...common}>
          <path
            d="M9 4h6l1 2h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3l1-2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M9 12h6M9 16h4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "/settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "/platform":
      return (
        <svg {...common}>
          <rect
            x="3.5"
            y="4"
            width="17"
            height="16"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path d="M3.5 9h17M9 9v11" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "/companies":
      return (
        <svg {...common}>
          <path
            d="M4 20V8l6-4 6 4v12M10 20v-6h4v6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M16 10h3v10H16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "/platform/voices":
      return (
        <svg {...common}>
          <path
            d="M4 12a8 8 0 0 1 16 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M8 12a4 4 0 0 1 8 0M12 12v7M9.5 19h5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect
            x="4"
            y="4"
            width="16"
            height="16"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M8 12h8M12 8v8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
