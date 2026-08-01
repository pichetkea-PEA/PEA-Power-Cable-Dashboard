import React from 'react';

interface PeaLogoProps {
  className?: string;
  size?: number;
  variant?: 'emblem' | 'full' | 'horizontal';
  showText?: boolean;
}

export function PsmdLogo({ 
  className = "h-10", 
  size,
  variant = 'full',
  showText
}: PeaLogoProps) {
  const isFull = variant === 'full' || variant === 'horizontal' || showText === true;
  const style = size ? { height: `${size}px` } : undefined;

  // PSMD Official Theme Colors
  const PURPLE_MAIN = "#5c1452";
  const PURPLE_DARK = "#3b0c35";
  const GOLD_ACCENT = "#d49a22";
  const GOLD_BRIGHT = "#f59e0b";

  if (!isFull) {
    // Square / Circle Compact Emblem (Icon & Lettermark)
    return (
      <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`} style={style}>
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full drop-shadow-sm select-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="psmdEmblemBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={PURPLE_MAIN} />
              <stop offset="100%" stopColor={PURPLE_DARK} />
            </linearGradient>
            <linearGradient id="psmdGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={GOLD_BRIGHT} />
              <stop offset="100%" stopColor={GOLD_ACCENT} />
            </linearGradient>
          </defs>

          {/* Hexagonal / Shield Base Container */}
          <rect x="8" y="8" width="184" height="184" rx="42" fill="url(#psmdEmblemBg)" />
          <rect x="12" y="12" width="176" height="176" rx="38" fill="none" stroke="url(#psmdGoldGrad)" strokeWidth="4" opacity="0.9" />

          {/* Electric Grid Lines */}
          <g stroke={GOLD_ACCENT} strokeWidth="1.5" opacity="0.25">
            <line x1="30" y1="100" x2="170" y2="100" />
            <line x1="100" y1="30" x2="100" y2="170" />
            <circle cx="100" cy="100" r="60" fill="none" strokeDasharray="4,4" />
          </g>

          {/* Power Bolt Symbol Top Center */}
          <path d="M 100,28 L 108,52 L 98,52 L 104,70 L 88,48 L 98,48 Z" fill="url(#psmdGoldGrad)" />

          {/* Center Stylized "PSMD" Text */}
          <text
            x="100"
            y="118"
            fill="#ffffff"
            fontSize="46"
            fontWeight="900"
            fontFamily="system-ui, -apple-system, sans-serif"
            textAnchor="middle"
            letterSpacing="2"
          >
            PSMD
          </text>

          {/* Subtext: POWER SYSTEM */}
          <text
            x="100"
            y="146"
            fill="url(#psmdGoldGrad)"
            fontSize="10"
            fontWeight="800"
            fontFamily="system-ui, -apple-system, sans-serif"
            textAnchor="middle"
            letterSpacing="2.5"
          >
            POWER SYSTEM
          </text>

          <text
            x="100"
            y="160"
            fill="#e2e8f0"
            fontSize="8"
            fontWeight="700"
            fontFamily="system-ui, -apple-system, sans-serif"
            textAnchor="middle"
            letterSpacing="1.5"
            opacity="0.9"
          >
            MANAGEMENT DIVISION
          </text>
        </svg>
      </div>
    );
  }

    // Full Horizontal PSMD Letter Logo Theme
    return (
      <div className={`relative inline-flex items-center shrink-0 ${className}`} style={style}>
        <svg
          viewBox="0 0 1300 260"
          className="h-full w-auto select-none drop-shadow-xs"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="psmdFullPurple" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={PURPLE_MAIN} />
              <stop offset="100%" stopColor={PURPLE_DARK} />
            </linearGradient>
            <linearGradient id="psmdFullGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={GOLD_BRIGHT} />
              <stop offset="100%" stopColor={GOLD_ACCENT} />
            </linearGradient>
            <linearGradient id="cableCopper" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
            <linearGradient id="cableJacket" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
          </defs>

          {/* === 1. LEFT EMBLEM BADGE (x: 10 to 250) === */}
          <g transform="translate(10, 10)">
            {/* Hexagonal Shield Container */}
            <rect x="0" y="0" width="240" height="240" rx="48" fill="url(#psmdFullPurple)" />
            <rect x="6" y="6" width="228" height="228" rx="42" fill="none" stroke="url(#psmdFullGold)" strokeWidth="5" />

            {/* Electric Circuit Rings */}
            <circle cx="120" cy="120" r="85" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.2" />
            <circle cx="120" cy="120" r="65" fill="none" stroke={GOLD_ACCENT} strokeWidth="2" strokeDasharray="6,4" opacity="0.6" />

            {/* Power Bolt Icon */}
            <path d="M 120,30 L 132,66 L 118,66 L 126,96 L 102,62 L 116,62 Z" fill="url(#psmdFullGold)" />

            {/* PSMD Center Letters in Shield */}
            <text
              x="120"
              y="142"
              fill="#ffffff"
              fontSize="58"
              fontWeight="900"
              fontFamily="system-ui, -apple-system, sans-serif"
              textAnchor="middle"
              letterSpacing="3"
            >
              PSMD
            </text>

            {/* Bottom Accent Bar */}
            <rect x="45" y="162" width="150" height="4" rx="2" fill="url(#psmdFullGold)" />

            <text
              x="120"
              y="188"
              fill="url(#psmdFullGold)"
              fontSize="13"
              fontWeight="800"
              fontFamily="system-ui, -apple-system, sans-serif"
              textAnchor="middle"
              letterSpacing="2"
            >
              POWER SYSTEM
            </text>
          </g>

          {/* === 2. CENTER CABLE MODEL PICTURE (x: 300 to 460, center at 380) === */}
          <g transform="translate(380, 125)">
            {/* Outer PVC Heavy Sheath Jacket */}
            <circle cx="0" cy="0" r="80" fill="url(#cableJacket)" stroke="url(#psmdFullGold)" strokeWidth="4" />
            <circle cx="0" cy="0" r="72" fill="none" stroke="#e2e8f0" strokeWidth="2" opacity="0.6" />
            
            {/* Copper Metallic Sheath Shield Ring Dots */}
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => {
              const rad = (deg * Math.PI) / 180;
              const cx = Math.cos(rad) * 66;
              const cy = Math.sin(rad) * 66;
              return <circle key={deg} cx={cx} cy={cy} r="3" fill="#f59e0b" />;
            })}

            {/* Inner Semi-Conductive Bedding Fill */}
            <circle cx="0" cy="0" r="60" fill="#1e1b4b" opacity="0.9" />

            {/* Phase 1 Core Conductor (Top) */}
            <g transform="translate(0, -26)">
              <circle cx="0" cy="0" r="22" fill="#fef3c7" stroke="#3b0c35" strokeWidth="2" />
              <circle cx="0" cy="0" r="16" fill="#1e293b" />
              <circle cx="0" cy="0" r="11" fill="url(#cableCopper)" stroke="#f59e0b" strokeWidth="1" />
              <circle cx="-2.5" cy="-2.5" r="2.5" fill="#fbbf24" opacity="0.7" />
              <circle cx="2.5" cy="2.5" r="2.5" fill="#fbbf24" opacity="0.7" />
            </g>

            {/* Phase 2 Core Conductor (Bottom Left) */}
            <g transform="translate(-22, 16)">
              <circle cx="0" cy="0" r="22" fill="#fef3c7" stroke="#3b0c35" strokeWidth="2" />
              <circle cx="0" cy="0" r="16" fill="#1e293b" />
              <circle cx="0" cy="0" r="11" fill="url(#cableCopper)" stroke="#f59e0b" strokeWidth="1" />
              <circle cx="-2.5" cy="-2.5" r="2.5" fill="#fbbf24" opacity="0.7" />
              <circle cx="2.5" cy="2.5" r="2.5" fill="#fbbf24" opacity="0.7" />
            </g>

            {/* Phase 3 Core Conductor (Bottom Right) */}
            <g transform="translate(22, 16)">
              <circle cx="0" cy="0" r="22" fill="#fef3c7" stroke="#3b0c35" strokeWidth="2" />
              <circle cx="0" cy="0" r="16" fill="#1e293b" />
              <circle cx="0" cy="0" r="11" fill="url(#cableCopper)" stroke="#f59e0b" strokeWidth="1" />
              <circle cx="-2.5" cy="-2.5" r="2.5" fill="#fbbf24" opacity="0.7" />
              <circle cx="2.5" cy="2.5" r="2.5" fill="#fbbf24" opacity="0.7" />
            </g>

            {/* Center Filler & Spark */}
            <circle cx="0" cy="0" r="7" fill="#5c1452" />
            <path d="M 0,-3.5 L 2.5,0 L 0,0 L 1.5,3.5 L -2.5,0 L -1,0 Z" fill="#f59e0b" />

            {/* Label Below Cable Model */}
            <rect x="-52" y="88" width="104" height="20" rx="10" fill="#3b0c35" stroke="#f59e0b" strokeWidth="1.5" />
            <text
              x="0"
              y="101"
              fill="#ffffff"
              fontSize="9.5"
              fontWeight="900"
              fontFamily="system-ui, -apple-system, sans-serif"
              textAnchor="middle"
              letterSpacing="0.8"
            >
              115kV HV CABLE
            </text>
          </g>

          {/* === 3. RIGHT TYPOGRAPHY: PSMD + SUBTITLE (x starts at 490) === */}
          <g transform="translate(490, 0)">
            {/* Main "PSMD" Big Bold Letter Logo */}
            <text
              x="0"
              y="130"
              fill={PURPLE_MAIN}
              fontSize="165"
              fontWeight="900"
              fontFamily="system-ui, -apple-system, sans-serif"
              letterSpacing="7"
            >
              PSMD
            </text>

            {/* Gold Lightning Accent Line Under PSMD */}
            <path
              d="M 5,152 L 670,152 L 682,160 L 698,144 L 688,152 L 760,152"
              fill="none"
              stroke="url(#psmdFullGold)"
              strokeWidth="11"
              strokeLinecap="round"
            />

            {/* Full Name Subtitle: POWER SYSTEM MANAGEMENT DIVISION */}
            <text
              x="5"
              y="196"
              fill={PURPLE_MAIN}
              fontSize="31"
              fontWeight="900"
              fontFamily="system-ui, -apple-system, sans-serif"
              letterSpacing="1.8"
            >
              POWER SYSTEM MANAGEMENT DIVISION
            </text>

            {/* Provincial Electricity Authority */}
            <text
              x="5"
              y="234"
              fill={PURPLE_MAIN}
              fontSize="28"
              fontWeight="800"
              fontFamily="system-ui, -apple-system, sans-serif"
              letterSpacing="2.5"
              opacity="1.0"
            >
              PROVINCIAL ELECTRICITY AUTHORITY
            </text>
          </g>
        </svg>
      </div>
    );
}

export default PsmdLogo;
