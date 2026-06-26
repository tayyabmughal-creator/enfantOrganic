const icons = {
  arrowRight: (
    <path
      d="M5 12h14m-6-6 6 6-6 6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  bag: (
    <>
      <path
        d="M7 9h10l1 11H6L7 9Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M9 9a3 3 0 1 1 6 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </>
  ),
  cart: (
    <>
      <path
        d="M3 5h2l2.2 9.5h9.8l2.2-7H8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="10" cy="19" r="1.2" fill="currentColor" />
      <circle cx="17" cy="19" r="1.2" fill="currentColor" />
    </>
  ),
  heart: (
    <path
      d="M12 20s-6.8-4.4-8.6-8.2C1.7 8.4 4 5 7.4 5A4.6 4.6 0 0 1 12 8a4.6 4.6 0 0 1 4.6-3c3.4 0 5.7 3.4 4 6.8C18.8 15.6 12 20 12 20Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  star: (
    <path
      d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.6 6.3 20.6l1.1-6.4L2.8 9.7l6.4-.9L12 3Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  plus: (
    <path
      d="M12 5v14M5 12h14"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  minus: (
    <path
      d="M5 12h14"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  close: (
    <path
      d="m6 6 12 12M18 6 6 18"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  menu: (
    <path
      d="M4 7h16M4 12h16M4 17h16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  chevronLeft: (
    <path
      d="m15 18-6-6 6-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  chevronDown: (
    <path
      d="m6 9 6 6 6-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  globe: (
    <>
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M3.8 12h16.4M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5S14.2 18.2 12 20.5C9.8 18.2 8.7 15.4 8.7 12S9.8 5.8 12 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" fill="currentColor" />
      <path d="m18.2 3.2.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" fill="currentColor" />
    </>
  ),
  leaf: (
    <path
      d="M18 4c-7.2.2-12 5-12 12 0 2.3 1.8 4 4.1 4C17 20 20 13.2 20 6.5V4h-2ZM8 16c1.5-3.7 4.3-6.3 8-8"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  shield: (
    <path
      d="M12 3 5.5 5.8v5.1c0 4.2 2.5 7.8 6.5 10.1 4-2.3 6.5-5.9 6.5-10.1V5.8L12 3Zm-2 9 1.5 1.5L15 10"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  truck: (
    <>
      <path
        d="M3 7h10v8H3V7Zm10 2h3l2 2.5V15h-5V9Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="7.5" cy="17" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="17" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  mail: (
    <path
      d="M4 7h16v10H4V7Zm0 1.5 8 5.5 8-5.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  search: (
    <>
      <circle
        cx="11"
        cy="11"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m16 16 4 4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </>
  ),
  instagram: (
    <>
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" />
    </>
  ),
  filter: (
    <path
      d="M4 7h16M7 12h10m-7 5h4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  check: (
    <path
      d="m5 12 4 4 10-10"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </>
  ),
  clipboard: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect x="9" y="2.5" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M9 11h6M9 14h6M9 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <circle cx="17" cy="9" r="2.6" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M15.5 14.4c2.9.3 5 2.4 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </>
  ),
  tag: (
    <>
      <path d="M11.5 3h7.2A1.3 1.3 0 0 1 20 4.3v7.2c0 .35-.14.7-.39.95l-7.93 7.93a1.34 1.34 0 0 1-1.9 0L3.2 13.8a1.34 1.34 0 0 1 0-1.9l7.93-7.93c.25-.25.6-.4.95-.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" />
    </>
  ),
  folder: (
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2c.4 0 .78.16 1.06.44L11.5 7h7.5A1.5 1.5 0 0 1 20.5 8.5v9A1.5 1.5 0 0 1 19 19H5a2 2 0 0 1-2-2V6.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
  ),
  box: (
    <>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </>
  ),
  building: (
    <>
      <path d="M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 20V8l7-4 7 4v12" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <path d="M9 20v-5h6v5M9 11h.01M12 11h.01M15 11h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20l1-4 11-11 3 3-11 11-4 1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <path d="M14 7l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="9" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="m3.5 17 5.5-5 4.5 4 3-2.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </>
  ),
  home: (
    <path d="M3.5 11 12 4l8.5 7v8a1.5 1.5 0 0 1-1.5 1.5h-3v-6h-8v6H5a1.5 1.5 0 0 1-1.5-1.5v-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 4 17c.94 0 1.5-.7 1.5-1.4 0-.7-.5-1.3-.5-2 0-.7.6-1.3 1.6-1.3H20a3 3 0 0 0 3-3c0-5-5-9.3-11-9.3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <circle cx="7.5" cy="11" r="1.2" fill="currentColor" />
      <circle cx="11" cy="7.5" r="1.2" fill="currentColor" />
      <circle cx="15.5" cy="8" r="1.2" fill="currentColor" />
      <circle cx="17.5" cy="12.5" r="1.2" fill="currentColor" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l2.7-2.7a4.5 4.5 0 0 0-6.4-6.4L11.4 6.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-2.7 2.7a4.5 4.5 0 0 0 6.4 6.4l1.3-1.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </>
  ),
  percent: (
    <>
      <path d="M5 19 19 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="7" cy="7" r="2.4" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="17" cy="17" r="2.4" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="9" width="17" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M3 13h18M12 9v11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 9c-1.5-3-5-3-5-1s2 2 5 2c3 0 5 0 5-2s-3.5-2-5 1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  chartLine: (
    <>
      <path d="M4 4v15a1 1 0 0 0 1 1h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.5 16 11 12l3 3 5-6.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" />
    </>
  ),
  chartPie: (
    <>
      <path d="M12 3v9h9a9 9 0 1 1-9-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <path d="M14 3a7 7 0 0 1 7 7h-7V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m7.5 11 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" />
      <path d="M4 18v1.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </>
  ),
  activity: (
    <path d="M3 12h4l3-7 4 14 3-7h4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" />
  ),
  returnArrow: (
    <>
      <path d="M9 7H5v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 11c0-2.5 2-4 4.5-4H17a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="m10.5 19-3.5-3 3.5-3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="17" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="17" cy="18" r="2.4" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="m8 10.7 7-3.4M8 13.3l7 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 10v4l11 5V5L4 10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <path d="M15 8.5a3.5 3.5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M6 14v3.5a1.5 1.5 0 0 0 3 0V15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </>
  ),
  apps: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="17.5" cy="17.5" r="3.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </>
  ),
  creditCard: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 15h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M19.4 14.5a7.5 7.5 0 0 0 0-5l1.7-1.3-1.6-2.8-2 .8a7.5 7.5 0 0 0-4.3-2.5L12.7 2h-3.4l-.5 1.7a7.5 7.5 0 0 0-4.3 2.5l-2-.8-1.6 2.8 1.7 1.3a7.5 7.5 0 0 0 0 5l-1.7 1.3 1.6 2.8 2-.8a7.5 7.5 0 0 0 4.3 2.5l.5 1.7h3.4l.5-1.7a7.5 7.5 0 0 0 4.3-2.5l2 .8 1.6-2.8-1.7-1.3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3h14v18l-2.5-1.5-2.5 1.5-2.5-1.5-2.5 1.5-2.5-1.5L5 21V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M3 9.5h12a2 2 0 0 1 2 2v1.5a2 2 0 0 1-2 2H3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <circle cx="15" cy="12.5" r="1" fill="currentColor" />
    </>
  ),
  trendingUp: (
    <>
      <path d="m4 17 6-6 4 4 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" />
      <path d="M14 8h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </>
  ),
  repeat: (
    <>
      <path d="M4 9V8a3 3 0 0 1 3-3h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="m15 2 3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" />
      <path d="M20 15v1a3 3 0 0 1-3 3H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="m9 22-3-3 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" />
    </>
  ),
  eye: (
    <>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </>
  ),
  cartX: (
    <>
      <path d="M3 5h2l2.2 9.5h9.8l1.6-5.2" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" />
      <circle cx="9" cy="19" r="1.2" fill="currentColor" />
      <circle cx="16" cy="19" r="1.2" fill="currentColor" />
      <path d="m14 4 6 6m0-6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M14 9.5a2 2 0 0 0-2-1.5h-1a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-1a2 2 0 0 1-2-1.5M12 7v1.5M12 15.5V17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  refresh: (
    <>
      <path d="M4 8a8 8 0 0 1 13.6-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M18 3v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" />
      <path d="M20 16a8 8 0 0 1-13.6 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M6 21v-5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M10 14h4l-1 4h-2l-1-4ZM8 20h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
};

export default function Icon({ name, size = 20, className = "" }) {
  const icon = icons[name];

  if (!icon) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {icon}
    </svg>
  );
}
