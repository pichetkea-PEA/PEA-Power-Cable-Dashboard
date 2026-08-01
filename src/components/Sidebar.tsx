import React, { useState } from 'react';
import PeaLogo from './PeaLogo';
import { PEAUser } from '../types';
import { PEA_AREA_NAMES } from '../utils/peaData';
import { 
  Globe, 
  Layers, 
  PlusCircle, 
  Database, 
  LogOut, 
  ChevronRight, 
  Zap, 
  FileSpreadsheet, 
  FolderPlus, 
  RefreshCw, 
  User,
  ShieldAlert
} from 'lucide-react';

interface SidebarProps {
  activeTab: 'admin' | 'area' | 'input' | 'records' | 'registration';
  setActiveTab: (tab: 'admin' | 'area' | 'input' | 'records' | 'registration') => void;
  user: PEAUser;
  onLogout: () => void;
  googleToken: string | null;
  spreadsheetId: string | null;
  spreadsheetIds: string[];
  isCreatingSheet: boolean;
  isLoading: boolean;
  onCreateTemplate: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  user,
  onLogout,
  googleToken,
  spreadsheetId,
  spreadsheetIds,
  isCreatingSheet,
  isLoading,
  onCreateTemplate,
  onDisconnect,
  onRefresh
}: SidebarProps) {
  const [isHovered, setIsHovered] = useState(false);

  const canAccessAdminSuite = user.role === 'Admin' || user.role === 'Manager';
  const canAccessSubmitLog = user.role === 'Admin' || user.role === 'Local Operator' || user.role === 'User';
  const canDisconnectDb = user.role === 'Admin';

  const navigationItems = [
    ...(canAccessAdminSuite ? [{
      id: 'admin' as const,
      label: 'Board Portfolio',
      subtitle: 'National Aggregate Overview',
      icon: Globe,
      badge: user.role
    }, {
      id: 'registration' as const,
      label: 'Asset Registration',
      subtitle: 'Register & Integrity Checks',
      icon: FolderPlus,
      badge: user.role
    }] : []),
    {
      id: 'area' as const,
      label: 'Area Telemetry',
      subtitle: 'Sector Equipment Status',
      icon: Layers,
      badge: user.interestArea
    },
    ...(canAccessSubmitLog ? [{
      id: 'input' as const,
      label: 'Submit Log',
      subtitle: 'New Inspection Entry',
      icon: PlusCircle,
      badge: 'Form'
    }] : []),
    {
      id: 'records' as const,
      label: 'Asset Record',
      subtitle: 'Searchable Catalog',
      icon: Database,
      badge: 'Data'
    }
  ];

  const hasConnectedSheet = (spreadsheetId || spreadsheetIds.length > 0);

  return (
    <aside 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`fixed left-0 top-0 bottom-0 bg-slate-900 border-r border-slate-800/80 text-gray-300 z-[6000] flex flex-col transition-all duration-300 ease-in-out shadow-2xl select-none ${
        isHovered ? 'w-64' : 'w-16'
      }`}
      id="pea-youtube-sidebar"
    >
      {/* Top Branding Section */}
      <div className="h-16 flex items-center px-3 border-b border-slate-800/80 gap-2.5 shrink-0 overflow-hidden">
        <div className="p-1 bg-purple-900/60 rounded-xl border border-purple-500/30 shrink-0">
          <PeaLogo variant="emblem" className="w-8 h-8" />
        </div>
        <div className={`transition-opacity duration-200 whitespace-nowrap ${isHovered ? 'opacity-100' : 'opacity-0 w-0 hidden'}`}>
          <h1 className="text-xs font-black text-white tracking-tight uppercase flex items-center gap-1.5">
            PSMD SYSTEM
            <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.2 rounded border border-purple-500/30">
              v2.0
            </span>
          </h1>
          <p className="text-[10px] text-purple-300/80 font-medium">Power System Management</p>
        </div>
      </div>

      {/* Main Navigation Tab Items */}
      <div className="flex-1 py-4 px-2 space-y-1.5 overflow-y-auto overflow-x-hidden">
        <div className={`px-2 text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-2 transition-opacity ${
          isHovered ? 'opacity-100' : 'opacity-0 hidden'
        }`}>
          Navigation
        </div>

        {navigationItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3.5 px-3 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer relative group ${
                isActive 
                  ? 'bg-purple-700 text-white shadow-lg shadow-purple-900/50' 
                  : 'hover:bg-slate-800/80 text-gray-400 hover:text-white'
              }`}
              title={!isHovered ? item.label : undefined}
            >
              {/* Active Bar Indicator on left */}
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-1 bg-yellow-400 rounded-r-full" />
              )}

              <Icon className={`w-5 h-5 shrink-0 transition-transform ${isActive ? 'text-yellow-400 scale-110' : 'group-hover:text-purple-300'}`} />

              <div className={`flex-1 text-left whitespace-nowrap transition-opacity duration-200 ${
                isHovered ? 'opacity-100' : 'opacity-0 w-0 hidden'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">{item.label}</span>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                    isActive ? 'bg-purple-800 text-purple-200' : 'bg-slate-800 text-gray-500'
                  }`}>
                    {item.badge}
                  </span>
                </div>
                <p className={`text-[10px] font-normal truncate ${isActive ? 'text-purple-200' : 'text-gray-500'}`}>
                  {item.subtitle}
                </p>
              </div>
            </button>
          );
        })}

        {/* Google Sheets Connection Quick Widget */}
        <div className={`pt-4 border-t border-slate-800/80 mt-4 transition-opacity ${
          isHovered ? 'opacity-100' : 'opacity-0 hidden'
        }`}>
          <div className="px-2 text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex justify-between items-center">
            <span>Database Pipeline</span>
            <button onClick={onRefresh} className="hover:text-purple-400 transition-colors" title="Sync Telemetry">
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin text-purple-400' : ''}`} />
            </button>
          </div>

          <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-800 text-[11px] space-y-2">
            {googleToken || user.role === 'Manager' || user.role === 'Local Operator' || hasConnectedSheet ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[10px]">
                  <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-400 animate-pulse" />
                  <span>Database Connected (Auto-Synced)</span>
                </div>
                {canDisconnectDb ? (
                  <button
                    onClick={onDisconnect}
                    className="text-[10px] text-red-400 hover:text-red-300 hover:underline font-semibold block cursor-pointer"
                  >
                    Disconnect Database
                  </button>
                ) : (
                  <span className="text-[9px] text-gray-500 italic block">
                    Disconnect Restricted (Admin Only)
                  </span>
                )}
              </div>
            ) : isLoading ? (
              <div className="flex items-center gap-1.5 text-yellow-400 font-semibold text-[10px] animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Searching Drive...</span>
              </div>
            ) : (
              <button
                disabled={isCreatingSheet}
                onClick={onCreateTemplate}
                className="w-full bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700/50 p-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5 text-yellow-400" />
                <span>{isCreatingSheet ? 'Creating...' : 'Initialize Sheet Template'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* User Session & Logout Footer */}
      <div className="p-2 border-t border-slate-800/80 bg-slate-950/80 shrink-0">
        <div className="flex items-center gap-2.5 p-1.5 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-purple-900/80 text-yellow-400 flex items-center justify-center font-bold text-xs shrink-0 border border-purple-700/50">
            <User className="w-4 h-4" />
          </div>

          <div className={`flex-1 min-w-0 transition-opacity duration-200 ${
            isHovered ? 'opacity-100' : 'opacity-0 w-0 hidden'
          }`}>
            <p className="text-xs font-bold text-white truncate">{user.name}</p>
            <p className="text-[10px] text-purple-300/70 truncate font-mono">
              Sector {user.interestArea} ({user.role})
            </p>
          </div>

          {isHovered && (
            <button
              onClick={onLogout}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
