import React from 'react';
import {
  FileText,
  Sparkles,
  CheckCircle2,
  GitCommit,
  Plus,
  Trash2,
  Activity,
  TrendingUp,
  Zap,
  Upload,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { CableTopologyNode, OfflineIndividualDefect } from '../../types';

export interface OfflineMeasurementStepProps {
  offlinePdfName: string;
  offlinePdfFile: File | null;
  offlinePdfAutoFilled: boolean;
  handleOfflinePdfUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  offlineTestDate: string;
  setOfflineTestDate: (val: string) => void;
  offlineCableLengthM: number;
  setOfflineCableLengthM: (val: number) => void;
  offlineNumberOfDefects: number;
  handleChangeDefectCount: (count: number) => void;
  offlineTestVoltageKv: string;
  setOfflineTestVoltageKv: (val: string) => void;
  offlineTerminationNearLabel: string;
  setOfflineTerminationNearLabel: (val: string) => void;
  offlineTerminationFarLabel: string;
  setOfflineTerminationFarLabel: (val: string) => void;
  offlineJoints: { id: string; label: string; locationM: number; accessoryModel: string }[];
  setOfflineJoints: React.Dispatch<
    React.SetStateAction<{ id: string; label: string; locationM: number; accessoryModel: string }[]>
  >;
  computedTopologyNodes: CableTopologyNode[];
  offlineIndividualDefects: OfflineIndividualDefect[];
  handleUpdateIndividualDefect: (index: number, patch: Partial<OfflineIndividualDefect>) => void;
  handleDefectPrpdUpload: (defectId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  getNearestTopologyContext: (locationM: number) => string;
  tdStage1VoltageKv: string;
  setTdStage1VoltageKv: (val: string) => void;
  tdStage1Mean: string;
  setTdStage1Mean: (val: string) => void;
  tdStage1Sdtd: string;
  setTdStage1Sdtd: (val: string) => void;
  tdStage2VoltageKv: string;
  setTdStage2VoltageKv: (val: string) => void;
  tdStage2Mean: string;
  setTdStage2Mean: (val: string) => void;
  tdStage2Sdtd: string;
  setTdStage2Sdtd: (val: string) => void;
  tdStage3VoltageKv: string;
  setTdStage3VoltageKv: (val: string) => void;
  tdStage3Mean: string;
  setTdStage3Mean: (val: string) => void;
  tdStage3Sdtd: string;
  setTdStage3Sdtd: (val: string) => void;
  tdDeltaTipUp: number;
  tdIeee4002Criteria: 'No Action Required' | 'Further Study Advised' | 'Action Required';
  setTdIeee4002Criteria: (val: 'No Action Required' | 'Further Study Advised' | 'Action Required') => void;
  tdTrendChartData: {
    stage: string;
    voltageKv: number;
    meanTd: number;
    sdtd: number;
    studyLimit: number;
    actionLimit: number;
  }[];
  offlineMaxDischargePc: string;
  setOfflineMaxDischargePc: (val: string) => void;
  offlineDefectLocationM: string;
  setOfflineDefectLocationM: (val: string) => void;
  offlineIeeeStatus: string;
  setOfflineIeeeStatus: (val: string) => void;
  riskMatrixLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  setRiskMatrixLevel: (val: 'Low' | 'Medium' | 'High' | 'Critical') => void;
  liveDiagnosticSummary: string;
}

export const OfflineMeasurementStep: React.FC<OfflineMeasurementStepProps> = ({
  offlinePdfName,
  offlinePdfAutoFilled,
  handleOfflinePdfUpload,
  offlineTestDate,
  setOfflineTestDate,
  offlineCableLengthM,
  setOfflineCableLengthM,
  offlineNumberOfDefects,
  handleChangeDefectCount,
  offlineTestVoltageKv,
  setOfflineTestVoltageKv,
  offlineTerminationNearLabel,
  setOfflineTerminationNearLabel,
  offlineTerminationFarLabel,
  setOfflineTerminationFarLabel,
  offlineJoints,
  setOfflineJoints,
  computedTopologyNodes,
  offlineIndividualDefects,
  handleUpdateIndividualDefect,
  handleDefectPrpdUpload,
  getNearestTopologyContext,
  tdStage1VoltageKv,
  setTdStage1VoltageKv,
  tdStage1Mean,
  setTdStage1Mean,
  tdStage1Sdtd,
  setTdStage1Sdtd,
  tdStage2VoltageKv,
  setTdStage2VoltageKv,
  tdStage2Mean,
  setTdStage2Mean,
  tdStage2Sdtd,
  setTdStage2Sdtd,
  tdStage3VoltageKv,
  setTdStage3VoltageKv,
  tdStage3Mean,
  setTdStage3Mean,
  tdStage3Sdtd,
  setTdStage3Sdtd,
  tdDeltaTipUp,
  tdIeee4002Criteria,
  setTdIeee4002Criteria,
  tdTrendChartData,
  offlineMaxDischargePc,
  setOfflineMaxDischargePc,
  offlineDefectLocationM,
  setOfflineDefectLocationM,
  offlineIeeeStatus,
  setOfflineIeeeStatus,
  riskMatrixLevel,
  setRiskMatrixLevel,
  liveDiagnosticSummary,
}) => {
  const maxCableLength = Math.max(10, Number(offlineCableLengthM) || 80);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="p-4 bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 rounded-xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
            <FileText className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-black uppercase tracking-wider text-white">
                Step 5: Offline Measurement & Diagnostic Suite (Tab 4 Columns R–AQ)
              </h4>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-black uppercase tracking-widest border border-amber-400/30">
                3 Structured Sections
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Section 1: General Info & Graphical Topology Builder • Section 2: Tan Delta (IEEE 400.2-2024) & Auto-Trend • Section 3: Offline PD Individual Defects & Movable Cursor
            </p>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 1: GENERAL INFO & GRAPHICAL CABLE TOPOLOGY BUILDER           */}
      {/* ==================================================================== */}
      <div className="p-5 bg-white rounded-xl border border-indigo-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-sm">
              1
            </div>
            <div>
              <h5 className="text-xs font-black uppercase tracking-wider text-indigo-950">
                Section 1: Offline General Info & Graphical Cable Topology Builder
              </h5>
              <p className="text-[10px] text-slate-500">
                Test Date, Total Cable Length, Interactive Graphical Topology (Terminations, Joints, Cable Spans), PDF Test Report Upload, and Number of Defect(s)
              </p>
            </div>
          </div>

          {/* PDF Test Report Upload Button */}
          <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm transition-colors">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{offlinePdfName ? 'Replace PDF Test Report' : 'Upload PDF Test Report'}</span>
            <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleOfflinePdfUpload} />
          </label>
        </div>

        {offlinePdfAutoFilled && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-900 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                PDF Test Report attached (<span className="font-mono">{offlinePdfName}</span>) — Offline parameters populated for verification.
              </span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-200/70 text-emerald-900">
              Col R & S Ready
            </span>
          </div>
        )}

        {/* Row 1: General Info Input Boxes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
              Test Date (DD/MM/YYYY) <span className="text-indigo-500">[Col AB]</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 15/05/2025"
              value={offlineTestDate}
              onChange={(e) => setOfflineTestDate(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
              Total Cable Length (m) <span className="text-indigo-500">[Col AC]</span>
            </label>
            <input
              type="number"
              min="10"
              step="1"
              placeholder="e.g. 80"
              value={offlineCableLengthM}
              onChange={(e) => setOfflineCableLengthM(Math.max(10, Number(e.target.value) || 80))}
              className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
              Number of Defect(s) <span className="text-indigo-500">[Col AE]</span>
            </label>
            <input
              type="number"
              min="0"
              max="12"
              value={offlineNumberOfDefects}
              onChange={(e) => handleChangeDefectCount(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
              VLF Test Voltage (kV) <span className="text-indigo-500">[Col T]</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 19.1 kV (1.5 U0)"
              value={offlineTestVoltageKv}
              onChange={(e) => setOfflineTestVoltageKv(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-indigo-500 outline-none"
            />
          </div>
        </div>

        {/* Graphical Cable Topology Builder */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h6 className="text-[11px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <GitCommit className="w-4 h-4 text-indigo-600" />
                Graphical Cable Topology Builder (Termination • Joint • Cable Span) <span className="text-indigo-500">[Col AD]</span>
              </h6>
              <p className="text-[10px] text-slate-500">
                Configure Near-End & Far-End Terminations and add Cable Joints along the {maxCableLength} m route.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextIdx = offlineJoints.length + 1;
                const suggestedDist = Math.round((maxCableLength / (nextIdx + 1)) * nextIdx);
                setOfflineJoints((prev) => [
                  ...prev,
                  {
                    id: `joint-${Date.now().toString().slice(-3)}`,
                    label: `Joint #${nextIdx}`,
                    locationM: suggestedDist,
                    accessoryModel: '3M QS2000 Premolded',
                  },
                ]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Cable Joint
            </button>
          </div>

          {/* Terminations & Joints Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">
                Near-End Termination (0 m)
              </label>
              <input
                type="text"
                value={offlineTerminationNearLabel}
                onChange={(e) => setOfflineTerminationNearLabel(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">
                Far-End Termination ({maxCableLength} m)
              </label>
              <input
                type="text"
                value={offlineTerminationFarLabel}
                onChange={(e) => setOfflineTerminationFarLabel(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          {/* Joint List Inputs */}
          {offlineJoints.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {offlineJoints.map((j, jIdx) => (
                <div
                  key={j.id}
                  className="p-2.5 bg-white rounded-lg border border-amber-200 flex items-center gap-2 shadow-2xs"
                >
                  <div className="w-6 h-6 rounded bg-amber-100 text-amber-800 font-black text-[10px] flex items-center justify-center shrink-0">
                    J{jIdx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={j.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOfflineJoints((prev) =>
                          prev.map((item, idx) => (idx === jIdx ? { ...item, label: val } : item))
                        );
                      }}
                      className="w-full text-[11px] font-bold text-slate-800 border-b border-slate-100 focus:border-indigo-500 outline-none pb-0.5"
                      placeholder="Joint Label"
                    />
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[9px] font-bold text-slate-400">Dist (m):</span>
                      <input
                        type="number"
                        min="1"
                        max={maxCableLength - 1}
                        step="0.1"
                        value={j.locationM}
                        onChange={(e) => {
                          const dist = Math.max(
                            1,
                            Math.min(maxCableLength - 1, Number(e.target.value) || 0)
                          );
                          setOfflineJoints((prev) =>
                            prev.map((item, idx) => (idx === jIdx ? { ...item, locationM: dist } : item))
                          );
                        }}
                        className="w-20 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-50 border border-slate-200 rounded"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setOfflineJoints((prev) => prev.filter((_, idx) => idx !== jIdx))
                    }
                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Remove Joint"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Live Graphical Single-Line Diagram of Cable Topology */}
          <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-white">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                Graphical Cable Route Schematic (0 m → {maxCableLength} m)
              </span>
              <div className="flex items-center gap-3 text-[9px] font-bold text-slate-300">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" /> Termination
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Cable Joint
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 h-1 bg-sky-400 inline-block rounded" /> XLPE Cable Span
                </span>
                {offlineNumberOfDefects > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block animate-pulse" /> PD Defect
                  </span>
                )}
              </div>
            </div>

            <div className="relative pt-7 pb-9 px-6">
              {/* Main Cable Line */}
              <div className="h-2.5 w-full bg-gradient-to-r from-sky-500 via-indigo-400 to-sky-500 rounded-full shadow-inner relative">
                {/* Cable Segment Span Labels */}
                {computedTopologyNodes
                  .filter((n) => n.type === 'cable' || n.type === 'cable_segment')
                  .map((seg) => {
                    const centerPct = Math.min(
                      96,
                      Math.max(4, ((seg.startM + (seg.lengthM || 0) / 2) / maxCableLength) * 100)
                    );
                    return (
                      <div
                        key={seg.id}
                        style={{ left: `${centerPct}%` }}
                        className="absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-800/90 border border-sky-500/30 text-[8px] font-mono text-sky-300 whitespace-nowrap"
                      >
                        {seg.label} ({seg.lengthM}m)
                      </div>
                    );
                  })}

                {/* Near-End Termination Node (0m) */}
                <div
                  style={{ left: '0%' }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
                >
                  <div className="w-5 h-5 rounded-md bg-emerald-500 border-2 border-white shadow-md flex items-center justify-center text-[8px] font-black text-slate-950">
                    T1
                  </div>
                  <span className="mt-5 text-[9px] font-bold text-emerald-300 whitespace-nowrap">
                    0 m
                  </span>
                </div>

                {/* Intermediate Joint Nodes */}
                {offlineJoints.map((j, idx) => {
                  const pct = Math.min(98, Math.max(2, (j.locationM / maxCableLength) * 100));
                  return (
                    <div
                      key={j.id}
                      style={{ left: `${pct}%` }}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
                    >
                      <div className="w-4 h-4 rounded-full bg-amber-400 border-2 border-slate-900 shadow-md flex items-center justify-center text-[7px] font-black text-slate-950">
                        J{idx + 1}
                      </div>
                      <span className="mt-5 text-[8px] font-mono font-bold text-amber-300 whitespace-nowrap">
                        {j.label} ({j.locationM}m)
                      </span>
                    </div>
                  );
                })}

                {/* Individual PD Defect Markers on the Schematic */}
                {offlineIndividualDefects.map((def, idx) => {
                  const pct = Math.min(100, Math.max(0, (def.locationM / maxCableLength) * 100));
                  return (
                    <div
                      key={def.id}
                      style={{ left: `${pct}%` }}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center z-10 pointer-events-none"
                    >
                      <div className="px-1.5 py-0.5 -mt-8 rounded bg-rose-600 text-white text-[8px] font-black shadow-md whitespace-nowrap border border-rose-300">
                        #{idx + 1}: {def.locationM}m ({def.amplitudePc}pC)
                      </div>
                      <div className="w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-white shadow-lg animate-pulse" />
                    </div>
                  );
                })}

                {/* Far-End Termination Node (Length m) */}
                <div
                  style={{ left: '100%' }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
                >
                  <div className="w-5 h-5 rounded-md bg-emerald-500 border-2 border-white shadow-md flex items-center justify-center text-[8px] font-black text-slate-950">
                    T2
                  </div>
                  <span className="mt-5 text-[9px] font-bold text-emerald-300 whitespace-nowrap">
                    {maxCableLength} m
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 2: TAN DELTA (TD) RESULT (IEEE 400.2-2024 & AUTO-PLOT)       */}
      {/* ==================================================================== */}
      <div className="p-5 bg-white rounded-xl border border-amber-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shadow-sm">
              2
            </div>
            <div>
              <h5 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Section 2: Tan Delta (TD) Result & IEEE 400.2-2024 Criteria
              </h5>
              <p className="text-[10px] text-slate-500">
                3-Stage VLF Tan Delta Input (0.5 U₀, 1.0 U₀, 1.5 U₀), IEEE 400.2-2024 Criteria Assessment, and Auto-Plotted TD Trend Curve
              </p>
            </div>
          </div>

          {/* Auto-Evaluate IEEE 400.2-2024 Button */}
          <button
            type="button"
            onClick={() => {
              const mean10 = parseFloat(tdStage2Mean) || 0;
              const sdtd10 = parseFloat(tdStage2Sdtd) || 0;
              const tipUp = Math.abs(tdDeltaTipUp);
              if (mean10 > 4.0 || sdtd10 > 0.5 || tipUp > 5.0) {
                setTdIeee4002Criteria('Action Required');
              } else if (mean10 > 1.5 || sdtd10 > 0.1 || tipUp > 1.5) {
                setTdIeee4002Criteria('Further Study Advised');
              } else {
                setTdIeee4002Criteria('No Action Required');
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-[10px] font-black uppercase tracking-wider border border-amber-300 transition-colors"
          >
            <Activity className="w-3.5 h-3.5" /> Auto-Evaluate IEEE 400.2-2024
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left 7 Cols: 3-Stage TD Input Table + IEEE 400.2-2024 Criteria */}
          <div className="lg:col-span-7 space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                    <th className="py-2.5 px-3">Test Voltage Stage</th>
                    <th className="py-2.5 px-3">Applied Voltage (kV)</th>
                    <th className="py-2.5 px-3">Mean TD [10⁻³]</th>
                    <th className="py-2.5 px-3">SDTD Stability [10⁻³]</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {/* Stage 1: 0.5 U0 */}
                  <tr className="bg-white">
                    <td className="py-2.5 px-3 font-black text-slate-800">
                      Stage 1 (0.5 U₀) <span className="text-[9px] text-slate-400 block">Cols AF–AH</span>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.1"
                        value={tdStage1VoltageKv}
                        onChange={(e) => setTdStage1VoltageKv(e.target.value)}
                        className="w-24 px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tdStage1Mean}
                        onChange={(e) => setTdStage1Mean(e.target.value)}
                        className="w-24 px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tdStage1Sdtd}
                        onChange={(e) => setTdStage1Sdtd(e.target.value)}
                        className="w-24 px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </td>
                  </tr>

                  {/* Stage 2: 1.0 U0 */}
                  <tr className="bg-amber-50/30">
                    <td className="py-2.5 px-3 font-black text-slate-800">
                      Stage 2 (1.0 U₀) <span className="text-[9px] text-slate-400 block">Cols AI–AK</span>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.1"
                        value={tdStage2VoltageKv}
                        onChange={(e) => setTdStage2VoltageKv(e.target.value)}
                        className="w-24 px-2 py-1.5 text-xs font-mono font-bold bg-white border border-amber-200 rounded-lg"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tdStage2Mean}
                        onChange={(e) => setTdStage2Mean(e.target.value)}
                        className="w-24 px-2 py-1.5 text-xs font-mono font-bold bg-white border border-amber-200 rounded-lg"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tdStage2Sdtd}
                        onChange={(e) => setTdStage2Sdtd(e.target.value)}
                        className="w-24 px-2 py-1.5 text-xs font-mono font-bold bg-white border border-amber-200 rounded-lg"
                      />
                    </td>
                  </tr>

                  {/* Stage 3: 1.5 U0 */}
                  <tr className="bg-white">
                    <td className="py-2.5 px-3 font-black text-slate-800">
                      Stage 3 (1.5 U₀) <span className="text-[9px] text-slate-400 block">Cols AL–AN</span>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.1"
                        value={tdStage3VoltageKv}
                        onChange={(e) => setTdStage3VoltageKv(e.target.value)}
                        className="w-24 px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tdStage3Mean}
                        onChange={(e) => setTdStage3Mean(e.target.value)}
                        className="w-24 px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        value={tdStage3Sdtd}
                        onChange={(e) => setTdStage3Sdtd(e.target.value)}
                        className="w-24 px-2 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Tip-Up (Delta TD) & IEEE 400.2-2024 Criteria Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider">
                  Tip-Up Δtanδ (1.5 U₀ − 0.5 U₀) [10⁻³] <span className="text-indigo-500">[Col AO]</span>
                </label>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-lg font-mono font-black text-indigo-900">
                    {tdDeltaTipUp} × 10⁻³
                  </span>
                  <span className="text-[9px] font-bold text-slate-400">Auto-computed</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                <label className="block text-[9px] font-black text-amber-900 uppercase tracking-wider mb-1">
                  TD Criteria (IEEE 400.2-2024) <span className="text-indigo-600">[Col AP]</span>
                </label>
                <select
                  value={tdIeee4002Criteria}
                  onChange={(e) => setTdIeee4002Criteria(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-amber-300 rounded-lg outline-none"
                >
                  <option value="No Action Required">No Action Required (Normal XLPE)</option>
                  <option value="Further Study Advised">Further Study Advised (Moderate Aging)</option>
                  <option value="Action Required">Action Required (High Dielectric Loss)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right 5 Cols: Auto-Plot Trend of TD Value */}
          <div className="lg:col-span-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h6 className="text-[10px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                Trend of TD Value (Auto-Plot from 3 Stages)
              </h6>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                IEEE 400.2-2024
              </span>
            </div>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={tdTrendChartData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="stage" tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      fontSize: '11px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 700 }} />
                  <Bar dataKey="sdtd" name="SDTD [10⁻³]" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={24} />
                  <Line
                    type="monotone"
                    dataKey="meanTd"
                    name="Mean TD [10⁻³]"
                    stroke="#4f46e5"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#4f46e5' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 3: OFFLINE PD RESULT (INDIVIDUAL DEFECTS & MOVABLE CURSOR)   */}
      {/* ==================================================================== */}
      <div className="p-5 bg-white rounded-xl border border-rose-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-rose-600 text-white font-black text-xs flex items-center justify-center shadow-sm">
              3
            </div>
            <div>
              <h5 className="text-xs font-black uppercase tracking-wider text-rose-950">
                Section 3: Offline PD Result & Individual Defect Mapping
              </h5>
              <p className="text-[10px] text-slate-500">
                Amount of Defect(s), Type of Defect for each individual defect, Per-Defect PRPD Picture Upload, Movable Defect Location Cursor along Cable Length, and Amplitude
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-700">
              Amount of Defect(s):
            </label>
            <input
              type="number"
              min="0"
              max="12"
              value={offlineNumberOfDefects}
              onChange={(e) => handleChangeDefectCount(parseInt(e.target.value, 10) || 0)}
              className="w-20 px-2.5 py-1.5 text-xs font-mono font-black bg-rose-50 border border-rose-300 text-rose-900 rounded-lg text-center"
            />
          </div>
        </div>

        {/* Individual Defect Cards */}
        {offlineNumberOfDefects === 0 ? (
          <div className="p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center">
            <p className="text-xs font-bold text-slate-600">
              No Offline PD Defects currently selected (0 defects). Increase &ldquo;Amount of Defect(s)&rdquo; above to log individual PD defects along the cable route.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {offlineIndividualDefects.map((defect, dIdx) => {
              const cursorPct = Math.min(100, Math.max(0, (defect.locationM / maxCableLength) * 100));
              const nearestElementText = getNearestTopologyContext(defect.locationM);

              return (
                <div
                  key={defect.id}
                  className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-4 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider">
                        Defect #{dIdx + 1}
                      </span>
                      <span className="text-xs font-black text-slate-800">
                        {defect.defectType} @ {defect.locationM} m
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                        {nearestElementText}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">
                      Stored in Col AQ JSON
                    </span>
                  </div>

                  {/* Movable Cursor along Cable Length (Termination Near-End to Termination Far-End) */}
                  <div className="p-3.5 bg-slate-900 rounded-xl border border-slate-800 text-white space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-[10px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-rose-400" />
                        Movable Defect Location Cursor Along Cable Length (0 m → {maxCableLength} m)
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-300">Exact Position:</span>
                        <input
                          type="number"
                          min="0"
                          max={maxCableLength}
                          step="0.5"
                          value={defect.locationM}
                          onChange={(e) => {
                            const loc = Math.max(0, Math.min(maxCableLength, Number(e.target.value) || 0));
                            handleUpdateIndividualDefect(dIdx, { locationM: loc });
                          }}
                          className="w-20 px-2 py-0.5 text-xs font-mono font-black bg-slate-800 border border-amber-400/50 rounded text-amber-300 text-right"
                        />
                        <span className="text-[10px] font-mono text-slate-300">m</span>
                      </div>
                    </div>

                    {/* Visual Cable Bar + Interactive Range Slider */}
                    <div className="relative pt-3 pb-2">
                      <div className="flex items-center justify-between text-[9px] font-bold text-emerald-300 mb-1">
                        <span>{offlineTerminationNearLabel} (0 m)</span>
                        <span className="text-amber-300 font-mono">
                          Cursor: {defect.locationM} m ({cursorPct.toFixed(1)}%) — {nearestElementText}
                        </span>
                        <span>{offlineTerminationFarLabel} ({maxCableLength} m)</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={maxCableLength}
                        step="0.5"
                        value={defect.locationM}
                        onChange={(e) => {
                          const loc = Number(e.target.value) || 0;
                          handleUpdateIndividualDefect(dIdx, { locationM: loc });
                        }}
                        className="w-full h-2.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
                      />
                      {/* Joint tick marks under slider */}
                      <div className="relative h-4 mt-1">
                        {offlineJoints.map((j, jIdx) => {
                          const pct = Math.min(98, Math.max(2, (j.locationM / maxCableLength) * 100));
                          return (
                            <span
                              key={j.id}
                              style={{ left: `${pct}%` }}
                              className="absolute -translate-x-1/2 text-[8px] font-mono text-amber-300"
                            >
                              ▲ J{jIdx + 1} ({j.locationM}m)
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Defect Input Grid + Per-Defect PRPD Picture Upload */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">
                          Type of Defect
                        </label>
                        <select
                          value={defect.defectType}
                          onChange={(e) =>
                            handleUpdateIndividualDefect(dIdx, { defectType: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="Internal Void / Cavity">Internal Void / Cavity</option>
                          <option value="Surface Discharges">Surface Discharges</option>
                          <option value="Cable Joint Defect">Cable Joint Defect</option>
                          <option value="Termination Stress Cone / Tracking">Termination Stress Cone / Tracking</option>
                          <option value="Protrusion / Corona">Protrusion / Corona</option>
                          <option value="Electrical Treeing">Electrical Treeing</option>
                          <option value="No Critical Defect">No Critical Defect</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">
                          Max Amplitude Qmax (pC)
                        </label>
                        <input
                          type="number"
                          value={defect.amplitudePc}
                          onChange={(e) => {
                            const pc = Number(e.target.value) || 0;
                            handleUpdateIndividualDefect(dIdx, {
                              amplitudePc: pc,
                              maxChargeNc: Number((pc / 1000).toFixed(3)),
                            });
                          }}
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">
                          Average Charge Qavg (pC)
                        </label>
                        <input
                          type="number"
                          value={defect.avgChargePc || 0}
                          onChange={(e) =>
                            handleUpdateIndividualDefect(dIdx, {
                              avgChargePc: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">
                          PDIV Inception Voltage (kV)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={defect.inceptionVoltageKv || 0}
                          onChange={(e) =>
                            handleUpdateIndividualDefect(dIdx, {
                              inceptionVoltageKv: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">
                          Phase
                        </label>
                        <select
                          value={defect.phase || 'Phase L1 (A)'}
                          onChange={(e) =>
                            handleUpdateIndividualDefect(dIdx, { phase: e.target.value })
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="Phase L1 (A)">Phase L1 (A)</option>
                          <option value="Phase L2 (B)">Phase L2 (B)</option>
                          <option value="Phase L3 (C)">Phase L3 (C)</option>
                          <option value="3-Phase Combined">3-Phase Combined</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">
                          Defect Severity
                        </label>
                        <select
                          value={defect.severity || 'Medium'}
                          onChange={(e) =>
                            handleUpdateIndividualDefect(dIdx, {
                              severity: e.target.value as any,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Critical">Critical</option>
                        </select>
                      </div>
                    </div>

                    {/* Right 4 Cols: Per-Defect PRPD Picture Upload */}
                    <div className="lg:col-span-4 p-3 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center">
                      <div className="flex items-center justify-between w-full mb-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-600">
                          Defect #{dIdx + 1} PRPD Picture
                        </span>
                        <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[9px] font-black uppercase tracking-wider border border-rose-200">
                          <Upload className="w-3 h-3" /> Upload PRPD
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleDefectPrpdUpload(defect.id, e)}
                          />
                        </label>
                      </div>
                      {defect.prpdImageUrl ? (
                        <img
                          src={defect.prpdImageUrl}
                          alt={`Defect ${dIdx + 1} PRPD`}
                          className="w-full h-24 object-contain rounded border border-slate-100 bg-slate-950"
                        />
                      ) : (
                        <div className="w-full h-24 rounded border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-400">
                          No PRPD image uploaded for Defect #{dIdx + 1}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Overall Offline Summary & 3x3 Risk Matrix Row (Columns U–AA) */}
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <h6 className="text-[10px] font-black uppercase tracking-wider text-slate-600">
            Overall Offline Summary & 3x3 Risk Matrix Assessment (Columns U–AA)
          </h6>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">
                Max Qmax (nC) [Col U]
              </label>
              <input
                type="text"
                value={offlineMaxDischargePc}
                onChange={(e) => setOfflineMaxDischargePc(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">
                Primary TDR Location [Col V]
              </label>
              <input
                type="text"
                value={offlineDefectLocationM}
                onChange={(e) => setOfflineDefectLocationM(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">
                IEEE 400.2 Status [Col Y]
              </label>
              <select
                value={offlineIeeeStatus}
                onChange={(e) => setOfflineIeeeStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="No Action Required">No Action Required</option>
                <option value="Further Study Advised">Further Study Advised</option>
                <option value="Action Required">Action Required</option>
              </select>
            </div>
            <div>
              <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">
                3x3 Risk Level [Col Z]
              </label>
              <select
                value={riskMatrixLevel}
                onChange={(e) => setRiskMatrixLevel(e.target.value as any)}
                className="w-full px-2.5 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="Low">Low Risk</option>
                <option value="Medium">Medium Risk</option>
                <option value="High">High Risk</option>
                <option value="Critical">Critical Risk</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl">
            <label className="block text-[9px] font-black text-emerald-900 uppercase mb-1">
              Auto-Generated Diagnostic & Maintenance Summary [Col AA]
            </label>
            <p className="text-[11px] font-mono text-slate-700 leading-relaxed">
              {liveDiagnosticSummary}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
