import React, { useState } from 'react';
import { Database, CheckCircle2, AlertCircle, RefreshCw, Layers, ShieldCheck, Loader2, Sparkles, X, HelpCircle, ChevronDown, ChevronUp, ExternalLink, AlertTriangle, ShieldAlert } from 'lucide-react';
import { PEA_AREA_NAMES } from '../utils/peaData';

export interface RegionalSheetStatus {
  spreadsheetId: string;
  area: string;
  areaName: string;
  scannedCount: number;
  loadedCount: number;
  status: 'scanning' | 'scanned' | 'loading' | 'loaded' | 'error';
  errorMessage?: string;
}

interface AssetLoadingModalProps {
  isOpen: boolean;
  isScanning: boolean;
  progressPercent: number;
  currentStepText: string;
  regionalSheets: RegionalSheetStatus[];
  totalScannedAssets: number;
  totalLoadedAssets: number;
  onClose?: () => void;
  onRetrySheet?: (spreadsheetId: string, area: string) => void;
}

export default function AssetLoadingModal({
  isOpen,
  isScanning,
  progressPercent,
  currentStepText,
  regionalSheets,
  totalScannedAssets,
  totalLoadedAssets,
  onClose,
  onRetrySheet
}: AssetLoadingModalProps) {
  const [showHelpGuide, setShowHelpGuide] = useState(false);
  const [retryingArea, setRetryingArea] = useState<string | null>(null);

  if (!isOpen) return null;

  const is100Percent = progressPercent >= 100;
  const offlineSheets = regionalSheets.filter(s => s.status === 'error');
  const hasOffline = offlineSheets.length > 0;

  const handleRetry = async (sheetId: string, area: string) => {
    if (!onRetrySheet) return;
    setRetryingArea(area);
    try {
      await onRetrySheet(sheetId, area);
    } finally {
      setRetryingArea(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 p-5 sm:p-6 text-white relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
                {is100Percent && !hasOffline ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 animate-bounce" />
                ) : isScanning ? (
                  <RefreshCw className="w-5 h-5 text-purple-300 animate-spin" />
                ) : (
                  <Database className="w-5 h-5 text-purple-200 animate-pulse" />
                )}
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  {is100Percent
                    ? hasOffline
                      ? 'Sync Completed with Offline Sheets'
                      : regionalSheets.length === 1
                      ? `100% ${regionalSheets[0].area} Asset Load Complete`
                      : '100% Asset Load Complete'
                    : isScanning
                    ? regionalSheets.length === 1
                      ? `Scanning ${regionalSheets[0].area} (${regionalSheets[0].areaName || PEA_AREA_NAMES[regionalSheets[0].area] || regionalSheets[0].area}) Google Sheet...`
                      : `Scanning ${regionalSheets.length} Regional Google Sheets...`
                    : regionalSheets.length === 1
                    ? `Synchronizing ${regionalSheets[0].area} (${regionalSheets[0].areaName || PEA_AREA_NAMES[regionalSheets[0].area] || regionalSheets[0].area}) Asset Database...`
                    : 'Synchronizing Asset Database...'}
                </h3>
                <p className="text-xs text-purple-200/80 mt-0.5">
                  {regionalSheets.length === 1
                    ? `PEA High Voltage Telemetry Pipeline • ${regionalSheets[0].area} (${regionalSheets[0].areaName || PEA_AREA_NAMES[regionalSheets[0].area] || regionalSheets[0].area})`
                    : 'PEA High Voltage Telemetry Pipeline'}
                </p>
              </div>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-all cursor-pointer"
                title="Close loading modal"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-4 space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-purple-200 flex items-center gap-1.5 truncate max-w-[80%]">
                {!is100Percent && <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-300 shrink-0" />}
                <span className="truncate">{currentStepText}</span>
              </span>
              <span className="text-emerald-300 font-bold font-mono text-sm shrink-0">
                {progressPercent}%
              </span>
            </div>
            <div className="w-full h-3 bg-black/30 rounded-full overflow-hidden p-0.5 border border-white/10 shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${
                  is100Percent
                    ? hasOffline
                      ? 'bg-gradient-to-r from-amber-500 to-emerald-400 shadow-lg'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-lg shadow-emerald-500/50'
                    : 'bg-gradient-to-r from-purple-500 via-indigo-400 to-emerald-400 shadow-md shadow-purple-500/30'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Audit Stats Banner */}
        <div className="bg-purple-50/90 border-b border-purple-100 px-5 sm:px-6 py-2.5 flex items-center justify-between text-xs font-medium">
          <div className="flex items-center gap-2 text-purple-900 truncate">
            <Layers className="w-4 h-4 text-purple-700 shrink-0" />
            <span className="truncate">
              Pre-Scan Target: <strong className="text-purple-950 font-mono">{totalScannedAssets.toLocaleString()}</strong> assets {regionalSheets.length === 1 ? `in ${regionalSheets[0].area}` : `across ${regionalSheets.length} sheets`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-bold shrink-0 ml-2">
            <span className={is100Percent ? 'text-emerald-700' : 'text-purple-800'}>
              Active: <span className="font-mono">{totalLoadedAssets.toLocaleString()}</span> / {totalScannedAssets.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Offline Alert & Guide Section */}
        {hasOffline && (
          <div className="bg-amber-50 border-b border-amber-200 px-5 sm:px-6 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-amber-900">
                    {offlineSheets.length} Regional Google {offlineSheets.length === 1 ? 'Sheet is' : 'Sheets are'} currently Offline
                  </h4>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Other areas were loaded successfully without interruption. You can click <strong>Reload</strong> on any offline area below.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHelpGuide(!showHelpGuide)}
                className="flex items-center gap-1 text-xs font-bold text-purple-800 hover:text-purple-950 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-all shrink-0 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>How to Fix</span>
                {showHelpGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {/* Expandable How To Fix Instructions */}
            {showHelpGuide && (
              <div className="mt-3 p-3.5 bg-white rounded-xl border border-amber-200 text-xs text-gray-700 space-y-2 animate-fadeIn">
                <h5 className="font-bold text-purple-900 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  How to fix an offline Google Sheet file:
                </h5>
                <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-gray-600 pl-1 leading-relaxed">
                  <li>
                    <strong className="text-gray-900">Share Permissions:</strong> Open the Google Sheet in Google Drive. Click <strong className="text-purple-900">Share</strong> (top right) and set General Access to <em>&ldquo;Anyone with the link&rdquo;</em> as <strong>Viewer</strong> or <strong>Editor</strong>, or grant access to your signed-in Google account.
                  </li>
                  <li>
                    <strong className="text-gray-900">Verify Sheet ID:</strong> Make sure the Spreadsheet ID in Admin Central Database Settings is correct and hasn&rsquo;t been moved to the Google Drive Trash.
                  </li>
                  <li>
                    <strong className="text-gray-900">Click &ldquo;Reload&rdquo; below:</strong> Once permissions are granted, click the <strong className="text-purple-700">Reload (🔄)</strong> button beside the offline region to immediately fetch and sync its assets without restarting the app.
                  </li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Regional Sheets Matrix Grid */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-3">
          <div className="flex items-center justify-between pb-1">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              {regionalSheets.length === 1
                ? `${regionalSheets[0].area} Regional Google Sheet Status Check`
                : `${regionalSheets.length} Regional Google Sheets Status Check`}
            </h4>
            <span className="text-[11px] text-gray-400 font-medium">
              {regionalSheets.length === 1
                ? `${regionalSheets[0].area} Regional Sector Audit`
                : 'N1 - NE3 Regional Sector Audit'}
            </span>
          </div>

          <div className={regionalSheets.length === 1 ? "grid grid-cols-1 gap-2.5" : "grid grid-cols-1 sm:grid-cols-2 gap-2.5"}>
            {regionalSheets.map((sheet) => {
              const isDone = sheet.status === 'loaded';
              const isLoading = sheet.status === 'loading' || retryingArea === sheet.area;
              const isError = sheet.status === 'error';
              
              return (
                <div
                  key={sheet.area}
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                    isDone
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                      : isLoading
                      ? 'bg-purple-50/80 border-purple-300 ring-2 ring-purple-400/20 text-purple-950'
                      : isError
                      ? 'bg-red-50/70 border-red-200 text-red-950 shadow-2xs'
                      : 'bg-gray-50 border-gray-200 text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs font-mono shrink-0 ${
                        isDone
                          ? 'bg-emerald-600 text-white'
                          : isLoading
                          ? 'bg-purple-600 text-white animate-pulse'
                          : isError
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {sheet.area}
                    </div>
                    <div className="truncate min-w-0">
                      <div className="text-xs font-bold truncate">
                        {sheet.areaName || PEA_AREA_NAMES[sheet.area] || sheet.area}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono truncate">
                        {isError ? (
                          <span className="text-red-600 font-medium">{sheet.errorMessage || 'Offline / Check sharing access'}</span>
                        ) : sheet.scannedCount > 0 ? (
                          <span>Scanned: {sheet.scannedCount} assets</span>
                        ) : (
                          <span>Scanning sheet...</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex items-center gap-1.5">
                    {isDone ? (
                      <div className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{sheet.loadedCount} Assets</span>
                      </div>
                    ) : isLoading ? (
                      <div className="flex items-center gap-1 text-purple-700 text-xs font-semibold">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Loading...</span>
                      </div>
                    ) : isError ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleRetry(sheet.spreadsheetId, sheet.area)}
                          disabled={isLoading}
                          className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer hover:scale-105 active:scale-95"
                          title={`Click to reload Google Sheet for ${sheet.area}`}
                        >
                          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                          <span>Reload</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-400 font-mono">Pending</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 gap-2">
          <div className="flex items-center gap-1.5 text-gray-600 font-medium">
            <ShieldCheck className="w-4 h-4 text-purple-700 shrink-0" />
            <span>Guaranteed zero asset loss verification</span>
          </div>
          {is100Percent ? (
            <div className="flex items-center gap-2">
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-purple-900 hover:bg-purple-950 text-white px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1 text-xs shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Continue to Dashboard</span>
                </button>
              )}
            </div>
          ) : (
            <span className="text-gray-400">Loading live data in background...</span>
          )}
        </div>
      </div>
    </div>
  );
}
