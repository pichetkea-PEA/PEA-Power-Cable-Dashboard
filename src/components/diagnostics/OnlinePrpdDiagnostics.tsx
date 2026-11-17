import React, { useState, useMemo } from 'react';
import { CableAsset } from '../../types';
import {
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Activity,
  Radio,
  AlertTriangle,
  CheckCircle2,
  Info,
  Maximize2,
  ExternalLink
} from 'lucide-react';

interface OnlinePrpdDiagnosticsProps {
  asset: CableAsset;
  onEditDiagnostics?: () => void;
  googleToken?: string;
  spreadsheetId?: string;
  driveFolderId?: string;
  onSaveSuccess?: (updatedAsset: CableAsset) => void;
}

export type PrpdPresetId = 'asset_telemetry' | 'benchmark_hfct' | 'benchmark_direct';

export default function OnlinePrpdDiagnostics({
  asset
}: OnlinePrpdDiagnosticsProps) {
  // Determine if asset is 3-phase (RMU, Unit Substation, Switchgear) or single phase
  const isThreePhaseAsset = useMemo(() => {
    const type = (asset.equipmentType || '').toLowerCase();
    return (
      type.includes('ring main unit') ||
      type.includes('unit substation') ||
      type.includes('switchgear') ||
      type.includes('rmu') ||
      type.includes('substation')
    );
  }, [asset.equipmentType]);

  const diag = asset.pdDiagnostics || {};
  const resolvedPrpdImage = diag.onlinePrpdImageUrl || asset.onlinePrpdImageUrl || null;
  const resolvedPhase = diag.onlinePrpdPhase || asset.onlinePrpdPhase || '';
  const resolvedAmplitude =
    diag.onlinePrpdAmplitude ??
    diag.onlinePrpdPeakCharge ??
    asset.onlinePrpdAmplitude ??
    asset.onlinePrpdPeakCharge ??
    asset.onlinePdAmplitude;
  const resolvedPulseRate =
    diag.onlinePrpdRepetitionRate ??
    diag.onlinePrpdPulseRate ??
    asset.onlinePrpdRepetitionRate ??
    asset.onlinePrpdPulseRate;
  const resolvedPhaseRange = diag.onlinePrpdPhaseRange || asset.onlinePrpdPhaseRange || '';
  const resolvedDefectType = diag.onlinePrpdDefectType || asset.onlinePrpdDefectType || '';
  const resolvedSeverity = diag.onlinePrpdSeverity || asset.onlinePrpdSeverity || '';
  const resolvedSummary = diag.diagnosticSummary || diag.summaryAnalysis || asset.diagnosticSummary || asset.pdDiagnosticSummary || '';

  const hasRealPrpdData = Boolean(
    resolvedPrpdImage ||
      resolvedPhase ||
      resolvedAmplitude !== undefined ||
      resolvedPulseRate !== undefined ||
      resolvedPhaseRange ||
      resolvedDefectType ||
      resolvedSeverity
  );

  const [activePhaseTab, setActivePhaseTab] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [selectedPreset, setSelectedPreset] = useState<PrpdPresetId>('asset_telemetry');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showGridOverlay, setShowGridOverlay] = useState<boolean>(true);
  const [showSineWave, setShowSineWave] = useState<boolean>(true);
  const [showThresholdLines, setShowThresholdLines] = useState<boolean>(true);
  const [cursorPos, setCursorPos] = useState<{ xPct: number; yPct: number; phaseDeg: number; ampVal: number } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);

  // Reset preset back to database telemetry whenever selected asset changes
  React.useEffect(() => {
    setSelectedPreset('asset_telemetry');
    setZoomLevel(1);
  }, [asset.equipmentId, resolvedPrpdImage]);

  // Direct read-only metrics from Google Sheet Tab 4 Columns K-Q (or optional reference benchmarks)
  const currentMetrics = useMemo(() => {
    if (selectedPreset === 'benchmark_hfct') {
      return {
        hasData: true,
        isReference: true,
        instrument: 'Reference Pattern: HFCT High-Frequency CT Sensor (CIGRE / IEC)',
        channel: 'Reference Channel (Phase A)',
        peakAmplitude: '812.8 mV',
        pulseRate: '263.73 pps',
        defectType: 'Internal Void / Cavity & Bad Contact Discharge',
        severity: 'Critical' as const,
        phaseInception: '85° - 145° (Positive) & 265° - 325° (Negative)',
        ieeeSeverityCode: 'IEEE 400.2 - Reference Alert Example',
        action: 'Reference pattern only. Switch back to "Asset Record (Tab 4 Cols K–Q)" to inspect the live database result for this asset.'
      };
    }

    if (selectedPreset === 'benchmark_direct') {
      return {
        hasData: true,
        isReference: true,
        instrument: 'Reference Pattern: Direct MV Acquisition Circuit (CIGRE / IEC)',
        channel: 'Reference Direct Sensor CH1',
        peakAmplitude: '14.5 mV',
        pulseRate: '185.20 pps',
        defectType: 'Internal Void Discharges (Dielectric Cavity)',
        severity: 'Advisory' as const,
        phaseInception: '90° - 135° (Dominant Positive Peak)',
        ieeeSeverityCode: 'IEEE 400.3 - Reference Advisory Example',
        action: 'Reference pattern only. Switch back to "Asset Record (Tab 4 Cols K–Q)" to inspect the live database result for this asset.'
      };
    }

    if (!hasRealPrpdData) {
      return {
        hasData: false,
        isReference: false,
        instrument: 'Google Sheet Tab 4 — PD & Diagnostic Data (Columns K–Q)',
        channel: 'Not Recorded',
        peakAmplitude: 'N/A',
        pulseRate: 'N/A',
        defectType: 'No Online PRPD Record in DB',
        severity: 'None' as const,
        phaseInception: 'Not Recorded',
        ieeeSeverityCode: 'Not Evaluated',
        action:
          'Google Sheet Tab 4 (Columns K–Q) currently contains no recorded online PRPD measurement for this asset. Submit a new log in Submit Log → Step 4 (Online Measurement).'
      };
    }

    const sev = resolvedSeverity || 'Not Evaluated';
    const ieeeCode =
      sev === 'Critical'
        ? 'IEEE 400.2 - Critical Alert'
        : sev === 'Moderate'
        ? 'IEEE 400.2 - Moderate Warning'
        : sev === 'Advisory'
        ? 'IEEE 400.2 - Level 1 Advisory'
        : sev === 'Normal'
        ? 'IEEE 400.2 - Normal'
        : sev;

    return {
      hasData: true,
      isReference: false,
      instrument: 'Google Sheet Tab 4 — Online HFCT PRPD Record (Columns K–Q)',
      channel: resolvedPhase || 'Not Recorded',
      peakAmplitude: resolvedAmplitude !== undefined && resolvedAmplitude !== null ? `${resolvedAmplitude} mV / pC` : 'Not Recorded',
      pulseRate: resolvedPulseRate !== undefined && resolvedPulseRate !== null ? `${resolvedPulseRate} pps` : 'Not Recorded',
      defectType: resolvedDefectType || 'Not Recorded',
      severity: sev,
      phaseInception: resolvedPhaseRange || 'Not Recorded',
      ieeeSeverityCode: ieeeCode,
      action: resolvedSummary || 'Online HFCT PRPD parameters loaded directly from Google Sheet Tab 4 (Columns K–Q).'
    };
  }, [
    selectedPreset,
    hasRealPrpdData,
    resolvedPhase,
    resolvedAmplitude,
    resolvedPulseRate,
    resolvedPhaseRange,
    resolvedDefectType,
    resolvedSeverity,
    resolvedSummary
  ]);

  // Historical online PRPD entries if multiple exist in DB history
  const historicalOnlineLogs = useMemo(() => {
    const history = asset.pdDiagnosticsHistory || [];
    return history.filter(
      (entry) =>
        entry.onlinePrpdImageUrl ||
        entry.onlinePrpdAmplitude !== undefined ||
        entry.onlinePrpdRepetitionRate !== undefined ||
        entry.onlinePrpdDefectType
    );
  }, [asset.pdDiagnosticsHistory]);

  // Cursor position readout over stage
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xPct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, (y / rect.height) * 100));

    const phaseDeg = Math.round((xPct / 100) * 360);
    const ampVal = Math.round(((50 - yPct) / 50) * 800);
    setCursorPos({ xPct, yPct, phaseDeg, ampVal });
  };

  const handleMouseLeave = () => {
    setCursorPos(null);
  };

  return (
    <div className="space-y-6 animate-fadeIn" id="online-prpd-diagnostics-root">
      {/* Header & Controls */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white rounded-2xl p-6 shadow-md">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-purple-800/80 pb-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-purple-500/30 text-purple-200 border border-purple-400/30 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Radio className="w-3 h-3 text-purple-300" />
                Page 2 : Online HFCT PRPD Pattern (DB Tab 4 Cols K–Q)
              </span>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {isThreePhaseAsset ? '3-Phase Equipment' : '1-Phase Cable Asset'}
              </span>
            </div>
            <h3 className="text-xl font-black tracking-tight">
              Phase Resolved Partial Discharge (PRPD) Diagnostic Result
            </h3>
            <p className="text-xs text-purple-200/80 max-w-2xl">
              Read-only display of online High-Frequency Current Transformer (HFCT) PRPD pattern image (Column K) and recorded diagnostic parameters (Columns L–Q) from Google Sheet Tab 4.
            </p>
          </div>

          {/* Read-Only Result Badge */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <span className="bg-white/10 text-purple-100 border border-white/20 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Result View Only (Submit via Submit Log Panel)</span>
            </span>
          </div>
        </div>

        {/* Source Selector (DB Record vs Reference Benchmarks) */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-purple-200 uppercase mr-1">View Source:</span>

            <button
              type="button"
              onClick={() => setSelectedPreset('asset_telemetry')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                selectedPreset === 'asset_telemetry'
                  ? 'bg-white text-purple-950 border-white shadow-sm'
                  : 'bg-purple-800/50 text-purple-200 border-purple-700/60 hover:bg-purple-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-purple-600" />
              <span>Asset DB Record (Cols K–Q) {hasRealPrpdData ? '• Recorded' : '• Empty'}</span>
            </button>

            <div className="flex items-center gap-1 bg-purple-950/60 p-0.5 rounded-xl border border-purple-800">
              <span className="text-[10px] font-bold text-purple-300 px-2 uppercase">Reference Guide:</span>
              <button
                type="button"
                onClick={() => setSelectedPreset('benchmark_hfct')}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  selectedPreset === 'benchmark_hfct'
                    ? 'bg-purple-500 text-white shadow-xs'
                    : 'text-purple-300 hover:text-white'
                }`}
                title="CIGRE / IEC Standard Void Discharge Reference"
              >
                Ref 1 (HFCT)
              </button>
              <button
                type="button"
                onClick={() => setSelectedPreset('benchmark_direct')}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  selectedPreset === 'benchmark_direct'
                    ? 'bg-purple-500 text-white shadow-xs'
                    : 'text-purple-300 hover:text-white'
                }`}
                title="Direct MV Coupling Reference"
              >
                Ref 2 (Direct MV)
              </button>
            </div>
          </div>

          {isThreePhaseAsset && (
            <div className="flex items-center gap-1 bg-purple-950/70 p-1 rounded-xl border border-purple-800">
              <span className="text-[10px] font-bold text-purple-300 px-2 uppercase">Channel Filter:</span>
              {(['all', 'A', 'B', 'C'] as const).map((phase) => (
                <button
                  key={phase}
                  type="button"
                  onClick={() => setActivePhaseTab(phase)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    activePhaseTab === phase
                      ? 'bg-purple-500 text-white shadow-xs'
                      : 'text-purple-200 hover:text-white'
                  }`}
                >
                  {phase === 'all' ? 'All Phases' : `Phase ${phase}`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Diagnostic Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left / Center: Recorded PRPD Visualizer (8 Cols) */}
        <div className="xl:col-span-8 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-150 p-5 shadow-xs flex flex-col gap-4">
            {/* Visualizer Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-700">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                    {selectedPreset === 'asset_telemetry'
                      ? resolvedPrpdImage
                        ? `Recorded PRPD Pattern (Column K) — ${asset.equipmentId}`
                        : `PRPD Telemetry Record — ${asset.equipmentId}`
                      : selectedPreset === 'benchmark_hfct'
                      ? 'Reference Standard 1 — HFCT 22 kV Feeder PRPD'
                      : 'Reference Standard 2 — Direct MV Acquisition Pattern'}
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    {currentMetrics.instrument}
                  </p>
                </div>
              </div>

              {/* Visual Controls */}
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                {selectedPreset !== 'asset_telemetry' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowGridOverlay(!showGridOverlay)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        showGridOverlay ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}
                    >
                      Grid Lines
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSineWave(!showSineWave)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        showSineWave ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}
                    >
                      50 Hz Wave
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowThresholdLines(!showThresholdLines)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        showThresholdLines ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}
                    >
                      Thresholds
                    </button>
                    <div className="h-4 w-px bg-gray-200 mx-1" />
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setZoomLevel((prev) => Math.min(2.5, prev + 0.25))}
                  className="p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel((prev) => Math.max(1, prev - 0.25))}
                  className="p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel(1)}
                  className="p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 cursor-pointer"
                  title="Reset Zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="p-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 cursor-pointer"
                  title="Fullscreen Lightbox"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Interactive Canvas / Image Stage */}
            <div
              className="relative w-full bg-slate-900 rounded-xl overflow-hidden border border-gray-200 select-none min-h-[380px] flex items-center justify-center cursor-crosshair group"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <div
                className="relative transition-transform duration-150 ease-out flex items-center justify-center w-full"
                style={{ transform: `scale(${zoomLevel})` }}
              >
                {selectedPreset === 'asset_telemetry' ? (
                  resolvedPrpdImage ? (
                    <div className="flex flex-col items-center justify-center p-4 w-full">
                      <img
                        src={resolvedPrpdImage}
                        alt={`Online PRPD Pattern for ${asset.equipmentId}`}
                        className="max-h-[380px] w-auto object-contain rounded-md shadow-md"
                      />
                    </div>
                  ) : (
                    <div className="text-center py-16 px-6 max-w-md mx-auto space-y-4">
                      <div className="w-14 h-14 rounded-2xl bg-purple-950/80 border border-purple-700/60 flex items-center justify-center mx-auto text-purple-400 shadow-inner">
                        <Radio className="w-7 h-7" />
                      </div>
                      <div className="space-y-1.5">
                        <h4 className="text-sm font-bold text-white tracking-wide">
                          {hasRealPrpdData
                            ? 'Telemetry Recorded (No PRPD Image Uploaded in Col K)'
                            : 'No Online PRPD Record Found in DB (Cols K–Q)'}
                        </h4>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {hasRealPrpdData ? (
                            <>
                              Scalar parameters for <span className="font-mono text-purple-300 font-bold">{asset.equipmentId}</span> are recorded in Columns L–Q (displayed on the right), while Column K image URL is empty.
                            </>
                          ) : (
                            <>
                              Google Sheet Tab 4 currently has no online PRPD capture for <span className="font-mono text-purple-300 font-bold">{asset.equipmentId}</span>. Use <strong>Submit Log → Step 4 (Online Measurement)</strong> to submit a record.
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  )
                ) : selectedPreset === 'benchmark_hfct' ? (
                  <svg viewBox="0 0 600 500" className="w-full max-w-[650px] h-auto bg-[#fafafa] rounded-md shadow-inner">
                    {showGridOverlay && (
                      <g stroke="#e2e8f0" strokeWidth="1">
                        {[0, 75, 150, 225, 300, 375, 450, 525, 600].map((x) => (
                          <line key={`x-${x}`} x1={x} y1="0" x2={x} y2="470" />
                        ))}
                        {[30, 85, 140, 195, 250, 305, 360, 415, 470].map((y) => (
                          <line key={`y-${y}`} x1="0" y1={y} x2="600" y2={y} />
                        ))}
                      </g>
                    )}
                    <line x1="0" y1="250" x2="600" y2="250" stroke="#64748b" strokeWidth="1.5" />
                    {showSineWave && (
                      <path
                        d="M 30,250 C 105,40 180,40 255,250 C 330,460 405,460 480,250 C 517.5,145 555,145 570,250"
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        opacity="0.85"
                      />
                    )}
                    {showThresholdLines && (
                      <g stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 4">
                        <line x1="0" y1="180" x2="600" y2="180" />
                        <text x="530" y="174" fontSize="10" fill="#b45309" fontWeight="bold">291.8 mV</text>
                        <line x1="0" y1="365" x2="600" y2="365" />
                        <text x="530" y="380" fontSize="10" fill="#b45309" fontWeight="bold">-505.4 mV</text>
                      </g>
                    )}
                    <g>
                      <rect x="210" y="240" width="9" height="9" rx="1" fill="#15803d" transform="rotate(45 214 244)" />
                      <rect x="224" y="210" width="10" height="10" rx="1" fill="#22c55e" transform="rotate(45 229 215)" />
                      <rect x="232" y="175" width="11" height="11" rx="1" fill="#f97316" transform="rotate(45 237 180)" />
                      <rect x="234" y="150" width="12" height="12" rx="1" fill="#dc2626" transform="rotate(45 240 156)" />
                      <rect x="515" y="305" width="10" height="10" rx="1" fill="#84cc16" transform="rotate(45 520 310)" />
                      <rect x="535" y="360" width="11" height="11" rx="1" fill="#eab308" transform="rotate(45 540 365)" />
                    </g>
                    <g fontSize="10" fill="#64748b" fontWeight="600">
                      <text x="5" y="35">800</text>
                      <text x="5" y="254">0</text>
                      <text x="5" y="465">-800</text>
                      <text x="30" y="490">0°</text>
                      <text x="180" y="490">90°</text>
                      <text x="330" y="490">180°</text>
                      <text x="480" y="490">270°</text>
                      <text x="575" y="490">360°</text>
                    </g>
                  </svg>
                ) : (
                  <svg viewBox="0 0 600 450" className="w-full max-w-[650px] h-auto bg-[#faf8f2] rounded-md shadow-inner">
                    {showGridOverlay && (
                      <g stroke="#e2d8ce" strokeWidth="1">
                        {[0, 150, 300, 450, 600].map((x) => (
                          <line key={`x2-${x}`} x1={x} y1="0" x2={x} y2="400" />
                        ))}
                        {[40, 130, 220, 310, 400].map((y) => (
                          <line key={`y2-${y}`} x1="0" y1={y} x2="600" y2={y} />
                        ))}
                      </g>
                    )}
                    <line x1="0" y1="220" x2="600" y2="220" stroke="#475569" strokeWidth="1.5" />
                    {showSineWave && (
                      <path
                        d="M 30,220 C 105,40 180,40 255,220 C 330,400 405,400 480,220 C 517.5,130 555,130 570,220"
                        fill="none"
                        stroke="#475569"
                        strokeWidth="1.8"
                        strokeDasharray="4 2"
                      />
                    )}
                    <g fill="#1e293b" opacity="0.85">
                      {[148, 155, 162, 170, 178, 184, 192, 198, 205, 210].map((x, idx) => (
                        <circle key={idx} cx={x} cy={140 + (idx % 4) * 14} r={idx % 3 === 0 ? 2 : 1.4} fill={idx % 3 === 0 ? '#e11d48' : '#1e293b'} />
                      ))}
                      {[455, 462, 470, 478, 485].map((x, idx) => (
                        <circle key={`n-${idx}`} cx={x} cy={245 + (idx % 3) * 10} r="1.4" fill="#475569" />
                      ))}
                    </g>
                    <g fontSize="10" fill="#64748b" fontWeight="600">
                      <text x="15" y="45">2.00E-2</text>
                      <text x="15" y="224">0.00</text>
                      <text x="15" y="405">-2.00E-2</text>
                      <text x="40" y="425">0°</text>
                      <text x="160" y="425">90°</text>
                      <text x="280" y="425">180°</text>
                      <text x="400" y="425">270°</text>
                      <text x="520" y="425">360°</text>
                    </g>
                  </svg>
                )}
              </div>

              {cursorPos && (
                <div
                  className="absolute pointer-events-none z-20 flex flex-col items-start"
                  style={{ left: `${cursorPos.xPct}%`, top: `${cursorPos.yPct}%` }}
                >
                  <div className="w-4 h-4 -ml-2 -mt-2 border-2 border-amber-400 rounded-full opacity-75" />
                  <div className="bg-slate-950/90 text-white border border-amber-400/80 rounded-md px-2.5 py-1 text-[10px] font-mono shadow-xl -mt-8 ml-3 whitespace-nowrap backdrop-blur-xs">
                    <span className="text-amber-400 font-bold">Φ: {cursorPos.phaseDeg}°</span> | <span>Scale Pos: {cursorPos.ampVal} mV</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Status Bar of Visualizer */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-4 text-slate-700 font-medium">
                <span><strong>Channel (Col L):</strong> {currentMetrics.channel}</span>
                <span><strong>Amplitude (Col M):</strong> {currentMetrics.peakAmplitude}</span>
                <span><strong>Pulse Rate (Col N):</strong> {currentMetrics.pulseRate}</span>
                <span className="hidden sm:inline"><strong>Phase Range (Col O):</strong> {currentMetrics.phaseInception}</span>
              </div>

              {resolvedPrpdImage && selectedPreset === 'asset_telemetry' && (
                <a
                  href={resolvedPrpdImage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Open Original Image</span>
                </a>
              )}
            </div>
          </div>

          {/* Historical Online PRPD Entries if multiple logs exist in DB */}
          {historicalOnlineLogs.length > 1 && selectedPreset === 'asset_telemetry' && (
            <div className="bg-white rounded-2xl border border-gray-150 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-purple-700" />
                  Recorded Online PRPD Inspection History ({historicalOnlineLogs.length} Records)
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5">Timestamp</th>
                      <th className="py-2 px-2.5">Phase (Col L)</th>
                      <th className="py-2 px-2.5">Amplitude (Col M)</th>
                      <th className="py-2 px-2.5">Pulse Rate (Col N)</th>
                      <th className="py-2 px-2.5">Defect (Col P)</th>
                      <th className="py-2 px-2.5">Severity (Col Q)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historicalOnlineLogs.map((entry, i) => (
                      <tr key={i} className="hover:bg-purple-50/30">
                        <td className="py-2 px-2.5 font-mono text-gray-700">{entry.timestamp || `Entry #${i + 1}`}</td>
                        <td className="py-2 px-2.5 font-medium text-gray-800">{entry.onlinePrpdPhase || 'N/A'}</td>
                        <td className="py-2 px-2.5 font-bold text-purple-900">
                          {entry.onlinePrpdAmplitude !== undefined ? `${entry.onlinePrpdAmplitude} mV / pC` : 'N/A'}
                        </td>
                        <td className="py-2 px-2.5 font-mono text-gray-700">
                          {entry.onlinePrpdRepetitionRate !== undefined ? `${entry.onlinePrpdRepetitionRate} pps` : 'N/A'}
                        </td>
                        <td className="py-2 px-2.5 text-gray-800">{entry.onlinePrpdDefectType || 'N/A'}</td>
                        <td className="py-2 px-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800">
                            {entry.onlinePrpdSeverity || 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right: Database Columns K-Q Readout Panel (4 Cols) */}
        <div className="xl:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-150 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-700" />
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                  PRPD Parameters (Cols K–Q)
                </h4>
              </div>
              <span
                className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${
                  currentMetrics.severity === 'Critical'
                    ? 'bg-red-100 text-red-800 border border-red-200'
                    : currentMetrics.severity === 'Moderate'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : currentMetrics.severity === 'Advisory'
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : currentMetrics.severity === 'Normal'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                {currentMetrics.severity === 'None' || currentMetrics.severity === 'Not Evaluated'
                  ? 'Not Evaluated'
                  : `${currentMetrics.severity}`}
              </span>
            </div>

            {/* Col P: Primary Classified Defect */}
            <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-4 space-y-1.5">
              <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">
                Col P — Online PD Defect Classification
              </span>
              <h5 className="text-sm font-black text-purple-950">
                {currentMetrics.defectType}
              </h5>
              <div className="flex items-center justify-between text-[11px] text-purple-800 pt-1">
                <span>Recorded Timestamp:</span>
                <span className="font-mono font-bold">{diag.timestamp || asset.timestamp || 'N/A'}</span>
              </div>
            </div>

            {/* Columns K-Q Telemetry Breakdown */}
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Col L • Sensor Phase:</span>
                <span className="font-bold text-gray-900">{currentMetrics.channel}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Col M • PD Amplitude:</span>
                <span className={`font-bold ${currentMetrics.peakAmplitude !== 'N/A' && currentMetrics.peakAmplitude !== 'Not Recorded' ? 'text-purple-700' : 'text-gray-400'}`}>
                  {currentMetrics.peakAmplitude}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Col N • Pulse Repetition Rate:</span>
                <span className="font-bold text-gray-900">{currentMetrics.pulseRate}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100 gap-2">
                <span className="text-gray-500 font-medium shrink-0">Col O • Phase Range:</span>
                <span className="font-bold text-gray-900 text-right">{currentMetrics.phaseInception}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Col Q • PD Severity:</span>
                <span className="font-bold text-gray-900">{currentMetrics.ieeeSeverityCode}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500 font-medium">Col K • Pattern Image Status:</span>
                <span className={`font-bold ${resolvedPrpdImage ? 'text-emerald-700' : 'text-gray-400'}`}>
                  {resolvedPrpdImage ? 'Archived & Linked' : 'Not Uploaded'}
                </span>
              </div>
            </div>

            {/* Recorded Engineering Note */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-1.5 text-xs">
              <div className="flex items-center gap-1 text-amber-900 font-bold uppercase">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                <span>Diagnostic Assessment Note</span>
              </div>
              <p className="text-amber-950 leading-relaxed font-medium">
                {currentMetrics.action}
              </p>
            </div>
          </div>

          {/* Standard Reference Guide */}
          <div className="bg-white rounded-2xl border border-gray-150 p-5 shadow-xs space-y-3">
            <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
              <Info className="w-4 h-4 text-purple-700" />
              Pattern Recognition Guide (CIGRE / IEC 60270)
            </h4>

            <div className="space-y-2 text-[11px]">
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-150 space-y-0.5">
                <span className="font-bold text-gray-900 block">1. Internal Void (Cavity)</span>
                <p className="text-gray-600 text-[10px]">
                  Symmetric discharge clouds located near voltage zero-crossings (45°–90° and 225°–270°).
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-150 space-y-0.5">
                <span className="font-bold text-gray-900 block">2. Surface Tracking / Discharge</span>
                <p className="text-gray-600 text-[10px]">
                  Asymmetric clusters with high charge peaks near voltage crests (90° or 270°).
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-150 space-y-0.5">
                <span className="font-bold text-gray-900 block">3. Bad Contact / Floating Potential</span>
                <p className="text-gray-600 text-[10px]">
                  Tight horizontal band of identical amplitude pulses spanning both cycles.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-purple-100 bg-purple-50/40 -mx-6 -mb-6 p-4 rounded-b-2xl mt-6">
        <div className="flex items-center gap-2 text-xs text-purple-900">
          <Activity className="w-4 h-4 text-purple-700" />
          <span className="font-semibold">
            Google Sheet Tab 4 Telemetry (Cols K–Q): <strong className="font-mono">{asset.equipmentId}</strong>
          </span>
          <span className="text-purple-600/80 text-[11px] hidden sm:inline">
            ({hasRealPrpdData ? 'Result Recorded in DB Cols K–Q' : 'No Result Recorded in DB Cols K–Q'})
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-bold text-purple-800 bg-white border border-purple-200 px-3 py-1.5 rounded-xl">
          <span>Read-Only Diagnostic Result View (Submit via Submit Log Panel)</span>
        </div>
      </div>

      {/* Lightbox Modal for Recorded DB Pattern */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-md font-black text-gray-900 uppercase">
                High-Resolution PRPD Inspection — {asset.equipmentId}
              </h3>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 flex flex-col items-center justify-center gap-4">
              {selectedPreset === 'asset_telemetry' ? (
                resolvedPrpdImage ? (
                  <img
                    src={resolvedPrpdImage}
                    alt={`Full Resolution PRPD Pattern - ${asset.equipmentId}`}
                    className="max-h-[60vh] w-auto object-contain rounded-lg shadow-lg"
                  />
                ) : (
                  <p className="text-xs text-slate-300 py-8 font-mono">
                    No PRPD pattern image recorded in Tab 4 Column K for {asset.equipmentId}.
                  </p>
                )
              ) : (
                <p className="text-xs text-purple-300 py-4 font-mono">
                  {currentMetrics.instrument}
                </p>
              )}

              <div className="w-full bg-white p-4 rounded-xl text-xs text-gray-700 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><strong>Channel (Col L):</strong> {currentMetrics.channel}</div>
                <div><strong>Peak Amplitude (Col M):</strong> {currentMetrics.peakAmplitude}</div>
                <div><strong>Pulse Repetition Rate (Col N):</strong> {currentMetrics.pulseRate}</div>
                <div><strong>Phase Inception Window (Col O):</strong> {currentMetrics.phaseInception}</div>
                <div><strong>Defect Classification (Col P):</strong> {currentMetrics.defectType}</div>
                <div><strong>Severity (Col Q):</strong> {currentMetrics.ieeeSeverityCode}</div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              {resolvedPrpdImage && selectedPreset === 'asset_telemetry' && (
                <a
                  href={resolvedPrpdImage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in New Tab</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="bg-purple-900 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-purple-950 cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
