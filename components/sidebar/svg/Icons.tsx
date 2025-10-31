'use client';
import * as React from 'react';

// Per-icon duotone CSS vars with fallbacks to your Logo.tsx palette.
// Courses: blue + indigo
// Setup:   green + purple
// Premium: red  + darkorange
// Stats:   configurable via --icon-stats-a / --icon-stats-b
// History: configurable via --icon-history-a / --icon-history-b
const COURSES_ST0 = 'var(--icon-courses-a, black)';
const COURSES_ST1 = 'var(--icon-courses-b, black)';
const SETUP_ST0   = 'var(--icon-setup-a, purple)';
const SETUP_ST1   = 'var(--icon-setup-b, darkpurple)';
const PREMIUM_ST0 = 'var(--icon-premium-a, black)';
const PREMIUM_ST1 = 'var(--icon-premium-b, black)';

// New palettes
const STATS_ST0   = 'var(--icon-stats-a, green)';
const STATS_ST1   = 'var(--icon-stats-b, darkgreen)';
const HISTORY_ST0 = 'var(--icon-history-a, gray)';
const HISTORY_ST1 = 'var(--icon-history-b, darkblue)';

// Profile neutrals
const PROFILE_ST0 = 'var(--icon-profile-a, black)';
const PROFILE_ST1 = 'var(--icon-profile-b, black)';

/** COURSES — duotone: blue (st0) + indigo (st1) */
export const CoursesIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" aria-hidden width={32} height={32} preserveAspectRatio="xMidYMid meet" {...props}>
    <path d="M473.5,149.5l-18.4,18.4l-17.9,18L395.3,144v238.5c-0.2,10.7-4,21.4-10.6,31.1c-7.8,11.5-19.6,21.8-34.1,29.4 c-8.5,4.5-18,8-28.1,10.4c-46.5,10.9-90.7-6.9-100.3-39.8c-0.2-0.8-0.4-1.6-0.6-2.5c-0.9-3.7-1.3-7.4-1.3-11.1 c0-5.9,1.1-11.8,3.2-17.6c5.6-15.5,18.3-29.9,35.6-40.4c4.9-3,10.3-5.7,15.9-8c5.7-2.3,11.8-4.3,18.1-5.8 c17.9-4.2,35.4-4.1,50.8-0.6V55.3h35.3L473.5,149.5z" fill={COURSES_ST1}/>
    <path d="M333.9,65.2v10H96.2c-2.8,0-5-2.2-5-5s2.2-5,5-5H333.9z" fill={COURSES_ST0}/>
    <path d="M68.8,75.2H43.5c-2.8,0-5-2.2-5-5s2.2-5,5-5h25.3c2.8,0,5,2.2,5,5S71.6,75.2,68.8,75.2z" fill={COURSES_ST0}/>
    <path d="M333.9,131.2v10H96.2c-2.8,0-5-2.2-5-5s2.2-5,5-5H333.9z" fill={COURSES_ST0}/>
    <path d="M68.8,141.2H43.5c-2.8,0-5-2.2-5-5s2.2-5,5-5h25.3c2.8,0,5,2.2,5,5S71.6,141.2,68.8,141.2z" fill={COURSES_ST0}/>
    <path d="M333.9,197.2v10H96.2c-2.8,0-5-2.2-5-5s2.2-5,5-5H333.9z" fill={COURSES_ST0}/>
    <path d="M68.8,207.2H43.5c-2.8,0-5-2.2-5-5s2.2-5,5-5h25.3c2.8,0,5,2.2,5,5S71.6,207.2,68.8,207.2z" fill={COURSES_ST0}/>
    <path d="M333.9,263.2v10H96.2c-2.8,0-5-2.2-5-5s2.2-5,5-5H333.9z" fill={COURSES_ST0}/>
    <path d="M68.8,273.2H43.5c-2.8,0-5-2.2-5-5s2.2-5,5-5h25.3c2.8,0,5,2.2,5,5S71.6,273.2,68.8,273.2z" fill={COURSES_ST0}/>
    <path d="M261.9,329.2c-2.8,1.4-5.4,2.9-8,4.4c-2.9,1.8-5.7,3.6-8.3,5.6H96.2c-2.8,0-5-2.2-5-5s2.2-5,5-5H261.9z" fill={COURSES_ST0}/>
    <path d="M68.8,339.2H43.5c-2.8,0-5-2.2-5-5s2.2-5,5-5h25.3c2.8,0,5,2.2,5,5S71.6,339.2,68.8,339.2z" fill={COURSES_ST0}/>
    <path d="M210.3,400.1c0,1.7,0.1,3.3,0.2,5H96.2c-2.8,0-5-2.2-5-5s2.2-5,5-5h114.3 C210.4,396.8,210.3,398.5,210.3,400.1z" fill={COURSES_ST0}/>
    <path d="M68.8,405.2H43.5c-2.8,0-5-2.2-5-5s2.2-5,5-5h25.3c2.8,0,5,2.2,5,5S71.6,405.2,68.8,405.2z" fill={COURSES_ST0}/>
  </svg>
);

/** SETUP — duotone: green (st0) + purple (st1) */
export const SetupIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" aria-hidden width={32} height={32} preserveAspectRatio="xMidYMid meet" {...props}>
    <path d="M286.4,125.4V43.1c-9.9-1.4-20.1-2.1-30.4-2.1c-10.3,0-20.4,0.7-30.4,2.1v168c15.4,5.8,26.3,20.6,26.3,38.1 c0,17.4-10.9,32.3-26.3,38v181.7c9.9,1.4,20.1,2.1,30.4,2.1c10.3,0,20.4-0.7,30.4-2.1V201.5c-15.4-5.8-26.3-20.6-26.3-38 C260,146,271,131.2,286.4,125.4z" fill={SETUP_ST1}/>
    <path d="M197,211.1V49.2c-21.9,6.2-42.3,15.8-60.8,28.2v225.2c15.4,5.8,26.4,20.7,26.4,38.1c0,17.4-11,32.3-26.4,38.1 v55.8c18.4,12.4,38.9,22,60.8,28.2V287.2c-15.4-5.8-26.3-20.6-26.3-38.1C170.7,231.7,181.6,216.9,197,211.1z" fill={SETUP_ST0}/>
    <path d="M41,256c0,61.2,25.6,116.5,66.7,155.6v-32.9c-15.4-5.8-26.3-20.7-26.3-38c0-17.4,10.9-32.2,26.3-38V100.4 C66.6,139.5,41,194.8,41,256z" fill={SETUP_ST1}/>
    <path d="M375.7,302.7V77.4c-18.4-12.4-38.9-22-60.8-28.2v76.2c15.4,5.8,26.3,20.6,26.3,38.1c0,17.4-11,32.3-26.3,38.1 v261.3c21.9-6.2,42.3-15.8,60.8-28.2v-55.8c-15.4-5.8-26.4-20.6-26.4-38.1S360.3,308.4,375.7,302.7z" fill={SETUP_ST0}/>
    <path d="M404.3,100.4v202.3c15.4,5.8,26.4,20.6,26.4,38.1s-11,32.3-26.4,38.1v32.9C445.4,372.5,471,317.2,471,256 C471,194.8,445.4,139.5,404.3,100.4z" fill={SETUP_ST1}/>
  </svg>
);

/** PREMIUM — duotone: red (st0) + darkorange (st1) */
export const PremiumIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" aria-hidden width={32} height={32} preserveAspectRatio="xMidYMid meet" {...props}>
    <path d="M219.4,208.9c0,5-2,9.6-5.3,12.9c-3.3,3.3-7.9,5.3-12.9,5.3h-22.8c0.5,42.4,35.1,76.7,77.6,76.7 s77.1-34.2,77.6-76.7h-22.8c-10.1,0-18.2-8.2-18.2-18.2c0-5,2-9.6,5.3-12.9c3.3-3.3,7.9-5.3,12.9-5.3h22.8v-36.5h-22.8 c-10.1,0-18.2-8.2-18.2-18.2c0-5,2-9.6,5.3-12.9c3.3-3.3,7.9-5.3,12.9-5.3h22.8c-0.2-21.1-8.9-40.1-22.7-54 c-14-14-33.5-22.7-54.9-22.7c-42.6,0-77.1,34.2-77.6,76.7h22.8c10.1,0,18.2,8.2,18.2,18.2c0,5-2,9.6-5.3,12.9 c-3.3,3.3-7.9,5.3-12.9,5.3h-22.8v36.5h22.8C211.2,190.6,219.4,198.8,219.4,208.9z" fill={PREMIUM_ST0}/>
    <path d="M354.7,197.7c-2.8,0-5,2.2-5,5s2.2,5,5,5c19.4,0,35.3-15.8,35.3-35.3s-15.8-35.3-35.3-35.3c-2.8,0-5,2.2-5,5 s2.2,5,5,5c13.9,0,25.3,11.3,25.3,25.3S368.7,197.7,354.7,197.7z" fill={PREMIUM_ST1}/>
    <path d="M157.3,207.7c2.8,0,5-2.2,5-5s-2.2-5-5-5c-13.9,0-25.3-11.3-25.3-25.3s11.3-25.3,25.3-25.3c2.8,0,5-2.2,5-5 s-2.2-5-5-5c-19.4,0-35.3,15.8-35.3,35.3S137.8,207.7,157.3,207.7z" fill={PREMIUM_ST1}/>
    <path d="M410.5,120c-2.8,0-5,2.2-5,5s2.2,5,5,5c23.4,0,42.4,19,42.4,42.4s-19,42.4-42.4,42.4c-2.8,0-5,2.2-5,5 s2.2,5,5,5c28.9,0,52.4-23.5,52.4-52.4S439.4,120,410.5,120z" fill={PREMIUM_ST1}/>
    <path d="M106.5,219.8c0-2.8-2.2-5-5-5c-23.4,0-42.4-19-42.4-42.4s19-42.4,42.4-42.4c2.8,0,5-2.2,5-5 c-28.9,0-52.4,23.5-52.4,52.4s23.5,52.4,52.4,52.4C104.3,224.8,106.5,222.5,106.5,219.8z" fill={PREMIUM_ST1}/>
    <path d="M336.9,308c-21.7,21.4-50.4,33.2-80.9,33.2s-59.2-11.8-80.9-33.2c-17.6-17.4-28.9-39.4-32.7-63.7l-38,6 c5.1,32.4,20.2,61.8,43.7,85.1c23.9,23.7,54.3,38.5,87.1,42.9v53.6c-26,5-48.8,19.2-64.7,39.1h64.7h41.7h64.7 c-15.9-19.9-38.7-34.1-64.7-39.1v-53.6c32.8-4.4,63.2-19.3,87.1-42.9c23.5-23.2,38.6-52.7,43.7-85.1l-38-6 C365.8,268.5,354.5,290.6,336.9,308z" fill={PREMIUM_ST1}/>
  </svg>
);

/** STATS — duotone */
export const StatsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" aria-hidden width={32} height={32} preserveAspectRatio="xMidYMid meet" {...props}>
    {/* Left column (st1) */}
    <rect x={41} y={388} width={87.8} height={32.7} fill={STATS_ST1} />
    <rect x={41} y={328.7} width={87.8} height={32.7} fill={STATS_ST1} />
    <rect x={41} y={269.3} width={87.8} height={32.7} fill={STATS_ST1} />
    <rect x={41} y={210} width={87.8} height={32.7} fill={STATS_ST1} />
    {/* Mid-left (st0) */}
    <rect x={155.1} y={388} width={87.8} height={32.7} fill={STATS_ST0} />
    <rect x={155.1} y={328.7} width={87.8} height={32.7} fill={STATS_ST0} />
    <rect x={155.1} y={269.3} width={87.8} height={32.7} fill={STATS_ST0} />
    {/* Mid-right (st1) */}
    <rect x={269.2} y={388} width={87.8} height={32.7} fill={STATS_ST1} />
    <rect x={269.2} y={328.7} width={87.8} height={32.7} fill={STATS_ST1} />
    <rect x={269.2} y={269.3} width={87.8} height={32.7} fill={STATS_ST1} />
    <rect x={269.2} y={210} width={87.8} height={32.7} fill={STATS_ST1} />
    {/* Right column (st0) */}
    <rect x={383.2} y={388} width={87.8} height={32.7} fill={STATS_ST0} />
    <rect x={383.2} y={328.7} width={87.8} height={32.7} fill={STATS_ST0} />
    <rect x={383.2} y={269.3} width={87.8} height={32.7} fill={STATS_ST0} />
    <rect x={383.2} y={210} width={87.8} height={32.7} fill={STATS_ST0} />
    <rect x={383.2} y={150.7} width={87.8} height={32.7} fill={STATS_ST0} />
    <rect x={383.2} y={91.3} width={87.8} height={32.7} fill={STATS_ST0} />
  </svg>
);

/** HISTORY — duotone */
export const HistoryIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 512 512" aria-hidden width={32} height={32} preserveAspectRatio="xMidYMid meet" {...props}>
    {/* Document and bars */}
    <path
      d="M41,147.5v217.1c0,12.7,10.3,23,23,23h240v-263H64C51.3,124.5,41,134.8,41,147.5z M95.1,292.3
         c5.7-2,11.4-2.8,16.7-2.6V182.7l26.1-2.8l80.4-8.7l26.1-2.8v134.1c0,4.7-1.7,9.6-4.7,14c-4.5,6.6-11.9,12.3-21.2,15.6
         c-18.4,6.4-37.1,0.6-41.7-12.8c-4.7-13.4,6.4-29.5,24.8-35.9c5.7-2,11.4-2.8,16.7-2.6v-83.3l-80.4,8.7v105.4c0,4.7-1.7,9.6-4.7,14
         c-4.5,6.6-11.9,12.3-21.2,15.6c-18.4,6.4-37.1,0.6-41.7-12.8C65.7,314.8,76.8,298.7,95.1,292.3z"
      fill={HISTORY_ST1}
    />
    {/* Outer arcs / timeline */}
    <path d="M435.5,346.4c22-23.7,35.5-55.5,35.5-90.4s-13.5-66.7-35.5-90.4l-66.7,66.7l-3.5-3.5c7,7,11.3,16.6,11.3,27.3 s-4.3,20.3-11.3,27.3l3.5-3.5L435.5,346.4z" fill={HISTORY_ST1}/>
    {/* Clock wedges (duotone) */}
    <path d="M365.3,283.3c-7,7-16.6,11.3-27.3,11.3c-9.1,0-17.4-3.1-24-8.4v100.6c7.8,1.4,15.8,2.2,24,2.2 c34.9,0,66.7-13.5,90.4-35.5l-66.7-66.7L365.3,283.3z" fill={HISTORY_ST0}/>
    <path d="M428.4,158.5c-23.7-22-55.5-35.5-90.4-35.5c-8.2,0-16.2,0.7-24,2.2v100.6c6.6-5.2,14.9-8.4,24-8.4 c10.7,0,20.3,4.3,27.3,11.3l-3.5-3.5L428.4,158.5z" fill={HISTORY_ST0}/>
    {/* Small joins (kept to preserve original outline) */}
    <path d="M432,161.9c0,0-0.1-0.1-0.1-0.1l0.3,0.3C432.1,162,432.1,162,432,161.9z" fill={HISTORY_ST1}/>
    <path d="M432,350.1c0,0,0.1-0.1,0.1-0.1l-0.3,0.3C432,350.1,432,350.1,432,350.1z" fill={HISTORY_ST1}/>
    <path d="M428.5,353.6l3.4-3.4C430.8,351.3,429.6,352.4,428.5,353.6L428.5,353.6z" fill={HISTORY_ST1}/>
    <path d="M432.2,349.9l3.4-3.4l-0.1-0.1C434.4,347.6,433.3,348.8,432.2,349.9z" fill={HISTORY_ST1}/>
  </svg>
);

/** PROFILE — duotone neutral */
export const ProfileIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 512 512"
    aria-hidden
    width={32}
    height={32}
    preserveAspectRatio="xMidYMid meet"
    {...props}
  >
    {/* Head (st0) */}
    <circle cx="256" cy="196" r="76" fill={PROFILE_ST0} />
    {/* Shoulders / bust (st1) */}
    <path
      d="M144 392c0-62 50-112 112-112s112 50 112 112v24H144v-24z"
      fill={PROFILE_ST1}
    />
  </svg>
);

/** Chevron stays monochrome so it follows text color */
export const ChevronRightIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden width={32} height={32} {...props}>
    <path d="M9 6l6 6-6 6" fill="currentColor" />
  </svg>
);
