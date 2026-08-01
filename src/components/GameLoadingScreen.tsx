import React, { useState, useEffect } from 'react';
import PeaLogo from './PeaLogo';
import { ShieldCheck, Cpu, Database, Wifi, Activity } from 'lucide-react';

interface GameLoadingScreenProps {
  onComplete?: () => void;
  title?: string;
  subtitle?: string;
  isOverlay?: boolean;
  isConnecting?: boolean;
}

const SYSTEM_TIPS = [
  "PEA Safety Standard: High voltage underground cables require thermal scans every 6 months.",
  "Asset Degradation Index: Health scores under 60% automatically trigger priority maintenance alerts.",
  "Google Sheets Integration: Data synchronized across 12 PEA Regional Sectors (N1-N3, C1-C3, S1-S3, NE1-NE3).",
  "Quick Navigation: Press 'Board Portfolio' to view national aggregate cable analytics.",
  "High Voltage Standard: 115 kV and 33 kV primary feeder cables are continuously monitored for partial discharge."
];

const LOADING_STAGES = [
  { text: "INITIALIZING PEA HIGH VOLTAGE CORE ENGINE...", icon: Cpu },
  { text: "CONNECTING TO GOOGLE SHEETS TELEMETRY PIPELINE...", icon: Wifi },
  { text: "DECRYPTING ASSET HEALTH & THERMAL SCANS...", icon: Activity },
  { text: "VERIFYING 12 REGIONAL SECTORS (N1-NE3)...", icon: Database },
  { text: "SYNCHRONIZING SYSTEM TELEMETRY METRICS...", icon: ShieldCheck },
  { text: "GRID INTEGRITY ESTABLISHED - READY", icon: ShieldCheck }
];

export default function GameLoadingScreen({ 
  onComplete, 
  title = "PSMD CABLE ASSET INTEGRITY SYSTEM", 
  subtitle = "Power System Management Division",
  isOverlay = false,
  isConnecting
}: GameLoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    // Pick random tip
    setTipIdx(Math.floor(Math.random() * SYSTEM_TIPS.length));

    // Animate progress timer
    const interval = setInterval(() => {
      setProgress(prev => {
        // If controlled by isConnecting, hold around 92% until connection finishes
        if (isConnecting !== undefined) {
          if (isConnecting) {
            // Smoothly approach 92%
            if (prev < 92) {
              const next = prev + Math.floor(Math.random() * 6) + 3;
              const bounded = next > 92 ? 92 : next;
              if (bounded >= 85) setStageIdx(4);
              else if (bounded >= 65) setStageIdx(3);
              else if (bounded >= 40) setStageIdx(2);
              else if (bounded >= 18) setStageIdx(1);
              return bounded;
            }
            return 92;
          } else {
            // Connection done! Complete to 100%
            setStageIdx(5);
            clearInterval(interval);
            if (onComplete) {
              setTimeout(onComplete, 400);
            }
            return 100;
          }
        }

        // Default timer mode
        if (prev >= 100) {
          clearInterval(interval);
          if (onComplete) {
            setTimeout(onComplete, 300);
          }
          return 100;
        }

        const next = prev + Math.floor(Math.random() * 8) + 4;
        
        // Update stage text based on progress thresholds
        if (next >= 85) setStageIdx(4);
        else if (next >= 65) setStageIdx(3);
        else if (next >= 40) setStageIdx(2);
        else if (next >= 18) setStageIdx(1);

        return next > 100 ? 100 : next;
      });
    }, 120);

    return () => clearInterval(interval);
  }, [onComplete, isConnecting]);

  const CurrentStageIcon = LOADING_STAGES[stageIdx].icon;

  return (
    <div className={`fixed inset-0 z-[10000] bg-slate-950 flex flex-col justify-between p-6 sm:p-10 select-none overflow-hidden font-mono ${isOverlay ? 'bg-slate-950/95 backdrop-blur-md' : ''}`}>
      
      {/* High-tech Grid Background Pattern */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.4) 0%, transparent 60%),
            linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 40px 40px, 40px 40px'
        }}
      />

      {/* Top Header Status */}
      <div className="relative z-10 flex justify-between items-center text-xs text-purple-400 border-b border-purple-900/40 pb-4">
        <div className="flex items-center gap-2 font-bold tracking-widest text-purple-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>SYSTEM LOADING // ONLINE CONNECTION</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-[11px] text-gray-500 font-bold">
          <span>PORT 3000</span>
          <span>LATENCY: 12ms</span>
          <span>REGION: THAILAND</span>
        </div>
      </div>

      {/* Center Game HUD & PEA Emblem */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto space-y-8">
        
        {/* Animated HUD Rings & Logo Container */}
        <div className="relative flex items-center justify-center">
          {/* Outer Pulsing HUD ring */}
          <div className="absolute w-56 h-56 rounded-full border-2 border-dashed border-purple-600/40 animate-[spin_12s_linear_infinite]" />
          <div className="absolute w-48 h-48 rounded-full border border-purple-500/30 animate-[spin_8s_linear_infinite_reverse]" />
          <div className="absolute w-40 h-40 rounded-full bg-purple-900/20 blur-xl animate-pulse" />

          {/* Core PEA Logo */}
          <div className="relative z-10 py-3 px-6 bg-white rounded-2xl border-2 border-purple-400/80 shadow-2xl shadow-purple-900/60 flex items-center justify-center">
            <PeaLogo variant="full" className="h-14 sm:h-16" />
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="text-center space-y-1.5 max-w-lg">
          <h1 className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-white to-purple-300 uppercase tracking-wider">
            {title}
          </h1>
          <p className="text-xs text-purple-400/80 font-sans font-medium tracking-wide">
            {subtitle}
          </p>
        </div>

        {/* Progress Bar & Status Text */}
        <div className="w-full max-w-md space-y-3">
          
          {/* Status Label & Percentage */}
          <div className="flex justify-between items-center text-xs font-bold text-purple-300 tracking-wider">
            <div className="flex items-center gap-2 text-[11px]">
              <CurrentStageIcon className="w-4 h-4 text-purple-400 animate-bounce" />
              <span className="truncate max-w-[280px]">{LOADING_STAGES[stageIdx].text}</span>
            </div>
            <span className="text-sm font-black font-mono text-yellow-400">{progress}%</span>
          </div>

          {/* Futuristic Segmented Bar */}
          <div className="relative w-full h-3.5 bg-slate-900 rounded-lg border border-purple-800/50 p-0.5 overflow-hidden shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-purple-600 via-purple-500 to-yellow-400 rounded-md transition-all duration-150 ease-out shadow-lg shadow-purple-500/50"
              style={{ width: `${progress}%` }}
            />
            {/* Segment Grid Overlay */}
            <div 
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={{
                backgroundImage: 'linear-gradient(to right, #000 2px, transparent 2px)',
                backgroundSize: '8px 100%'
              }}
            />
          </div>

          {/* Matrix Ticks */}
          <div className="flex justify-between text-[9px] text-gray-500 font-mono font-bold tracking-widest px-0.5">
            <span>0% READ</span>
            <span>50% TELEMETRY</span>
            <span>100% READY</span>
          </div>
        </div>
      </div>

      {/* Bottom Video Game "SYSTEM TIP" Banner */}
      <div className="relative z-10 max-w-2xl mx-auto w-full bg-slate-900/90 border border-purple-900/60 rounded-xl p-3.5 flex items-start gap-3 shadow-xl">
        <div className="bg-purple-900/60 p-2 rounded-lg text-yellow-400 shrink-0 font-bold text-xs uppercase tracking-wider">
          PEA TIP
        </div>
        <div className="text-xs text-purple-200/90 font-sans leading-relaxed pt-0.5">
          {SYSTEM_TIPS[tipIdx]}
        </div>
      </div>

    </div>
  );
}
