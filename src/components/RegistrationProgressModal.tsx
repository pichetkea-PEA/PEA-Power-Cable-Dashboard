import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Sparkles, X } from 'lucide-react';

export interface RegistrationProgressModalProps {
  isOpen: boolean;
  title?: string;
  currentStepMessage: string;
  progressPercent: number; // 0 to 100
  isError?: boolean;
  errorMessage?: string;
  isComplete?: boolean;
  onClose?: () => void;
  totalItems?: number;
  currentItemIndex?: number;
  currentItemName?: string;
}

export function RegistrationProgressModal({
  isOpen,
  title = "Registering New Asset",
  currentStepMessage,
  progressPercent,
  isError = false,
  errorMessage,
  isComplete = false,
  onClose,
  totalItems,
  currentItemIndex,
  currentItemName
}: RegistrationProgressModalProps) {
  if (!isOpen) return null;

  const percentClamped = Math.min(100, Math.max(0, Math.round(progressPercent)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-purple-100 dark:border-slate-800 max-w-md w-full overflow-hidden transition-all transform scale-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-800 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl border border-white/10">
              {isComplete ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400 animate-bounce" />
              ) : isError ? (
                <AlertCircle className="w-6 h-6 text-rose-400" />
              ) : (
                <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
              )}
            </div>
            <div>
              <h3 className="text-base font-black tracking-wide leading-snug">{title}</h3>
              <p className="text-xs text-purple-200 font-medium flex items-center gap-1.5 mt-0.5">
                {totalItems && totalItems > 1 
                  ? `Processing Record ${(currentItemIndex || 0) + 1} of ${totalItems}`
                  : currentItemName || 'PEA Cable Asset Registration'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black font-mono tracking-tight text-amber-300">
              {percentClamped}%
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Progress Bar Container */}
          <div>
            <div className="flex justify-between text-xs font-bold text-gray-500 mb-2">
              <span>Registration Progress</span>
              <span className="text-purple-700 dark:text-purple-400 font-mono font-black">{percentClamped}%</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-4 p-0.5 overflow-hidden shadow-inner border border-gray-200 dark:border-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${
                  isError
                    ? 'bg-rose-500'
                    : isComplete
                    ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400'
                    : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-amber-500 animate-pulse'
                }`}
                style={{ width: `${percentClamped}%` }}
              />
            </div>
          </div>

          {/* Status Message Box */}
          <div className="bg-purple-50/90 dark:bg-slate-800/90 rounded-xl p-4 border border-purple-100 dark:border-slate-700 flex items-center gap-3">
            {!isComplete && !isError && (
              <Loader2 className="w-5 h-5 text-purple-700 dark:text-purple-400 animate-spin shrink-0" />
            )}
            {isComplete && (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            {isError && (
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-relaxed grow">
              {currentStepMessage || "Processing registration parameters..."}
            </div>
          </div>

          {/* Error detail if any */}
          {isError && errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 font-medium leading-relaxed">
              <strong>Registration Error:</strong> {errorMessage}
            </div>
          )}

          {/* Completion / Error Action Button */}
          {(isComplete || isError) && onClose && (
            <button
              onClick={onClose}
              className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 ${
                isError
                  ? 'bg-slate-800 hover:bg-slate-900 text-white'
                  : 'bg-purple-900 hover:bg-purple-950 text-white'
              }`}
            >
              {isError ? (
                <>
                  <X className="w-4 h-4" />
                  <span>Close & Retry</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Registration Complete (Close)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
