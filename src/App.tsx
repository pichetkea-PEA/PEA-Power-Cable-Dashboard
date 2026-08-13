import React, { useState, useEffect, FormEvent } from 'react';
import { PEAUser, CableAsset, UserRole } from './types';
import { PEA_AREAS, PEA_AREA_NAMES, getMockAssets } from './utils/peaData';
import { initAuth, googleSignIn, googleSignInWithRedirect, logout } from './utils/firebaseAuth';
import { saveSectorSpreadsheet, getAllSectorSpreadsheets, saveCentralAdminDatabaseConfig, getCentralAdminDatabaseConfig, saveCentralAssetsCache, getCentralAssetsCache, clearCentralAssetsCache } from "./utils/firestore";
import { fetchSheetsData, autoDiscoverAndSync, createSheetsTemplate, migrateAll12GoogleSheetsEquipmentIds } from './utils/googleSheets';
import { getBangkokTimestamp } from './utils/dateUtils';
import { findUserByEmail, isAdminAccount, saveUserAccount } from './utils/userManagement';
import AdminDashboard from './components/AdminDashboard';
import AreaDashboard from './components/AreaDashboard';
import InputForm from './components/InputForm';
import AssetRecord from './components/AssetRecord';
import AdminRegistrationSuite from './components/AdminRegistrationSuite';
import PeaLogo from './components/PeaLogo';
import GameLoadingScreen from './components/GameLoadingScreen';
import Sidebar from './components/Sidebar';
import { 
  Zap, 
  Layers, 
  PlusCircle, 
  RefreshCw, 
  AlertCircle,
  FileSpreadsheet,
  Globe,
  ExternalLink,
  Database,
  UserCheck,
  UserPlus,
  Shield,
  CheckCircle2,
  X,
  User,
  ShieldAlert,
  ChevronRight,
  Clock
} from 'lucide-react';

export default function App() {
  // Auth & Connection states
  const [user, setUser] = useState<PEAUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [spreadsheetIds, setSpreadsheetIds] = useState<string[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  
  // App UI states
  const [activeTab, setActiveTab] = useState<'admin' | 'area' | 'input' | 'records' | 'registration'>('area');
  const [urlEquipmentId] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('equipmentId') || params.get('assetId') || params.get('eqId') || params.get('asset') || null;
    } catch (e) {
      return null;
    }
  });

  useEffect(() => {
    if (urlEquipmentId) {
      setActiveTab('records');
    }
  }, [urlEquipmentId]);
  const [assets, setAssets] = useState<CableAsset[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncingCentralDb, setIsSyncingCentralDb] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; statusText: string }>({ current: 0, total: 0, statusText: '' });
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);
  const [isCreatingSheet, setIsCreatingSheet] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [firestoreQuotaExceeded, setFirestoreQuotaExceeded] = useState<boolean>(false);
  const [lastFetchedTime, setLastFetchedTime] = useState<string | null>(() => localStorage.getItem('pea_last_fetched_time'));

  const updateLastFetchedTimestamp = (ts?: string) => {
    const timestamp = ts ? getBangkokTimestamp(ts) : getBangkokTimestamp();
    localStorage.setItem('pea_last_fetched_time', timestamp);
    setLastFetchedTime(timestamp);
  };

  const formatLastFetchedTime = (isoString: string | null) => {
    if (!isoString) return null;
    try {
      const d = new Date(isoString.includes('T') ? isoString : isoString.replace(/-/g, '/'));
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleString('en-GB', {
        timeZone: 'Asia/Bangkok',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (e) {
      return isoString;
    }
  };

  // Video Game Loading & Page Transition states
  const [showGameLoading, setShowGameLoading] = useState<boolean>(false);
  const [isPageSwitching, setIsPageSwitching] = useState<boolean>(false);
  const [isMigratingIds, setIsMigratingIds] = useState<boolean>(false);

  // Login & Sign-Up form states
  const [loginMode, setLoginMode] = useState<'signin' | 'signup'>('signin');
  const [selectedArea, setSelectedArea] = useState<string>('N1');
  const [selectedRole, setSelectedRole] = useState<UserRole>('Local Operator');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isIframe, setIsIframe] = useState<boolean>(false);

  const selectedAreaRef = React.useRef(selectedArea);
  selectedAreaRef.current = selectedArea;
  const selectedRoleRef = React.useRef(selectedRole);
  selectedRoleRef.current = selectedRole;

  // Sign up fields
  const [signUpEmail, setSignUpEmail] = useState<string>('');
  const [signUpName, setSignUpName] = useState<string>('');
  const [signUpEmployeeId, setSignUpEmployeeId] = useState<string>('');
  const [signUpArea, setSignUpArea] = useState<string>('N1');
  const [signUpRole, setSignUpRole] = useState<UserRole>('Local Operator');
  const [signUpSuccessMsg, setSignUpSuccessMsg] = useState<string>('');

  // Admin role selection modal state
  const [showAdminRoleModal, setShowAdminRoleModal] = useState<boolean>(false);
  const [pendingAdminUser, setPendingAdminUser] = useState<{
    uid?: string;
    email: string;
    name: string;
    accessToken?: string;
    isGuest?: boolean;
  } | null>(null);
  const [modalRoleChoice, setModalRoleChoice] = useState<UserRole>('Admin');

  // Synchronize Central Admin Database from Google Drive / Firestore across ALL roles
  const syncCentralDatabase = async (token: string | null, email: string, role: UserRole, area: string) => {
    setIsSyncingCentralDb(true);
    setIsLoading(true);
    setErrorMessage('');

    // Pre-load Firestore central assets cache immediately if available
    try {
      const cached = await getCentralAssetsCache();
      if (cached && cached.length > 0) {
        console.log("Central DB Sync: Pre-loaded cached central assets from Firestore:", cached.length);
        setAssets(cached);
      }
      if ((window as any).firestoreQuotaExceeded) {
        setFirestoreQuotaExceeded(true);
      }
    } catch (e) {
      console.warn("Firestore cache pre-load error:", e);
      if ((window as any).firestoreQuotaExceeded) {
        setFirestoreQuotaExceeded(true);
      }
    }

    try {
      let config = await getCentralAdminDatabaseConfig();
      let firestoreMap = await getAllSectorSpreadsheets();

      const isAdminUser = role === 'Admin' || isAdminAccount(email);

      // Auto-discover central sheets in Google Drive ONLY if not yet configured
      if (token && !config && Object.keys(firestoreMap).length === 0) {
        console.log("Central DB Sync: Initial setup - Auto-discovering Admin Google Sheets in Drive...");
        try {
          const { spreadsheets, folders } = await autoDiscoverAndSync(token);
          const sheetIds = Array.from(new Set(Object.values(spreadsheets))).filter(Boolean);

          if (sheetIds.length > 0) {
            const newConfig = {
              spreadsheetIds: sheetIds,
              spreadsheetsByArea: spreadsheets,
              foldersByArea: folders,
              updatedAt: new Date().toISOString()
            };
            await saveCentralAdminDatabaseConfig(newConfig);
            config = newConfig;
            firestoreMap = await getAllSectorSpreadsheets();
          }
        } catch (err) {
          console.warn("Auto-discover non-critical error during initial setup:", err);
        }
      }

      // Extract central sheet IDs and target sector sheet ID
      let allSheetIds: string[] = [];
      if (config?.spreadsheetIds?.length) {
        allSheetIds = Array.from(new Set(config.spreadsheetIds)).filter(Boolean);
      } else if (Object.keys(firestoreMap).length > 0) {
        allSheetIds = Array.from(new Set(Object.values(firestoreMap).map(item => item.spreadsheetId))).filter(Boolean);
      }

      const targetSheetId = config?.spreadsheetsByArea?.[area] || firestoreMap[area]?.spreadsheetId || allSheetIds[0] || null;
      const targetFolderId = config?.foldersByArea?.[area] || firestoreMap[area]?.folderId || null;

      setSpreadsheetIds(allSheetIds);
      if (targetSheetId) setSpreadsheetId(targetSheetId);
      if (targetFolderId) setFolderId(targetFolderId);

      // Local Operator: load ONLY the telemetry data related to their assigned area
      if (role === 'Local Operator' && area !== 'ALL') {
        const areaSheetIds = targetSheetId ? [targetSheetId] : [];
        let loadedFromCache = false;
        try {
          const cached = await getCentralAssetsCache();
          if (cached && cached.length > 0) {
            const areaAssets = cached.filter(a => 
              a.equipmentId?.startsWith(area) || 
              a.city?.toLowerCase().includes(area.toLowerCase()) || 
              a.peaArea === area || 
              a.equipmentId?.split('-')[0]?.trim() === area
            );
            if (areaAssets.length > 0) {
              setAssets(areaAssets);
              setSyncSuccessMessage(`Local Sector ${area} Telemetry Synchronized! Loaded ${areaAssets.length} cable assets for ${area} area.`);
              loadedFromCache = true;
            }
          }
        } catch (e) {}

        if (token && areaSheetIds.length > 0) {
          if (!loadedFromCache) {
            await handleLoadSpreadsheet(token, areaSheetIds, false);
          } else {
            // Refresh in background
            handleLoadSpreadsheet(token, areaSheetIds, false).catch(() => {});
          }
        } else if (!loadedFromCache) {
          let cached = await getCentralAssetsCache();
          if (!cached || cached.length === 0) {
            const backup = localStorage.getItem('pea_central_assets_backup');
            if (backup) {
              try { cached = JSON.parse(backup); } catch (e) {}
            }
          }
          if (!cached || cached.length === 0) {
            cached = getMockAssets();
          }

          // Strictly filter assets for the user's logged-in area (e.g. N1)
          const areaAssets = cached.filter(a => 
            a.equipmentId?.startsWith(area) || 
            a.city?.toLowerCase().includes(area.toLowerCase()) || 
            a.peaArea === area || 
            a.equipmentId?.split('-')[0]?.trim() === area
          );

          setAssets(areaAssets.length > 0 ? areaAssets : cached);
          setSyncSuccessMessage(`Local Sector ${area} Telemetry Synchronized! Loaded ${areaAssets.length} cable assets for ${area} area.`);
        }
      } else if (token && allSheetIds.length > 0) {
        // Admin / Manager / National level: Pre-load cache first for instant login speed
        let loadedFromCache = false;
        try {
          const cached = await getCentralAssetsCache();
          if (cached && cached.length > 0) {
            setAssets(cached);
            setSyncSuccessMessage(`Central Admin Database Synchronized! Loaded ${cached.length.toLocaleString()} cable assets from Admin database.`);
            loadedFromCache = true;
          }
        } catch (e) {}

        if (!loadedFromCache) {
          await handleLoadSpreadsheet(token, allSheetIds, isAdminUser);
        } else {
          // Sync remaining sheets in background without holding up loading UI
          handleLoadSpreadsheet(token, allSheetIds, isAdminUser).catch(() => {});
        }
      } else {
        // Non-admin roles (Manager, Engineer, Area Head): load central assets from Firestore cache or local backup
        let loaded = false;
        try {
          const cached = await getCentralAssetsCache();
          if (cached && cached.length > 0) {
            console.log("Central DB Sync: Loaded cached assets from Firestore for role", role, ":", cached.length);
            setAssets(cached);
            setSyncSuccessMessage(`Central Admin Database Synchronized! Loaded ${cached.length.toLocaleString()} cable assets from Admin Google Sheets database.`);
            loaded = true;
          }
        } catch (e) {
          console.warn("Error loading cached assets in syncCentralDatabase:", e);
        }

        if (!loaded) {
          const backup = localStorage.getItem('pea_central_assets_backup');
          if (backup) {
            try {
              const parsed = JSON.parse(backup);
              if (Array.isArray(parsed) && parsed.length > 0) {
                console.log("Central DB Sync: Loaded backup assets for role", role, ":", parsed.length);
                setAssets(parsed);
                setSyncSuccessMessage(`Central Admin Database Loaded from Backup! ${parsed.length.toLocaleString()} cable assets active.`);
                loaded = true;
              }
            } catch (e) {}
          }
        }

        if (!loaded) {
          // Robust mock fallback so user is never left with an empty dashboard
          console.log("Central DB Sync: Cache and backup unavailable, falling back to mock assets.");
          setAssets(getMockAssets());
          setSyncSuccessMessage(`Central Offline Mode Enabled! Loaded telemetry datasets.`);
        }

        if ((window as any).firestoreQuotaExceeded) {
          setFirestoreQuotaExceeded(true);
        }
      }
    } catch (err: any) {
      console.error("Central Database Sync failure:", err);
      setErrorMessage(`Sync Warning: ${err.message || 'Unable to sync Google Sheet database.'}`);
    } finally {
      setIsLoading(false);
      setIsSyncingCentralDb(false);
    }
  };

  // Helper to finalize setting user session and connecting sheets
  const finalizeUserSession = async (
    email: string,
    name: string,
    uid: string,
    role: UserRole,
    area: string,
    token?: string | null
  ) => {
    const registered = findUserByEmail(email);

    if (registered?.status === 'pending' && !isAdminAccount(email)) {
      setShowGameLoading(false);
      setIsLoading(false);
      setNeedsAuth(true);
      setErrorMessage(
        `Account Registration Pending Admin Authorization. Request ID: ${registered.requestId || 'REQ-PEA-92810'}. Employee ID: ${registered.employeeId || 'PEA-58291'}. Notice sent to PEA Executive Admin.`
      );
      return;
    }

    if (registered?.status === 'rejected' && !isAdminAccount(email)) {
      setShowGameLoading(false);
      setIsLoading(false);
      setNeedsAuth(true);
      setErrorMessage(`Account registration request was declined by PEA Executive Admin.`);
      return;
    }

    // Strict Account-Area mismatch check for Local Operator
    const currentSelectedArea = selectedAreaRef.current;
    const effectiveRole = registered ? registered.role : role;
    const allowedArea = registered ? registered.interestArea : null;

    if (effectiveRole === 'Local Operator' && allowedArea && allowedArea !== 'ALL' && currentSelectedArea !== allowedArea) {
      setShowGameLoading(false);
      setIsLoading(false);
      setNeedsAuth(true);
      setErrorMessage(
        `Access Denied: You have no permission to access ${currentSelectedArea} area. The area ${allowedArea} (${PEA_AREA_NAMES[allowedArea] || allowedArea}) is allowed for this account.`
      );
      return;
    }

    setShowGameLoading(true);
    setIsLoading(true);

    const finalArea = (role === 'Admin' || role === 'Manager') ? 'ALL' : area;
    const newUser: PEAUser = {
      uid,
      email,
      name,
      role,
      interestArea: finalArea
    };

    if (token) {
      setGoogleToken(token);
    }

    await syncCentralDatabase(token || null, email, role, finalArea);

    setUser(newUser);
    setNeedsAuth(false);
    
    // Set default active view
    if (role === 'Admin' || role === 'Manager') {
      setActiveTab('admin');
    } else {
      setActiveTab('area');
    }
  };

  // Shared helper to automatically discover existing sheets and load assets
  const handleAutoDiscovery = async (token: string, email: string, area: string, role: UserRole) => {
    await syncCentralDatabase(token, email, role, area);
  };

  // Initialize Auth state listeners on load
  useEffect(() => {
    setIsIframe(window.self !== window.top);

    // Pre-load central Firestore assets cache on app boot so dashboard never starts with empty mock data
    getCentralAssetsCache().then(cached => {
      if (cached && cached.length > 0) {
        console.log("App Init: Pre-loaded central assets cache from Firestore:", cached.length);
        setAssets(cached);
      } else {
        console.log("App Init: Cache empty on mount, using mock assets.");
        setAssets(getMockAssets());
      }
      if ((window as any).firestoreQuotaExceeded) {
        setFirestoreQuotaExceeded(true);
      }
    }).catch(err => {
      console.warn("App Init: Could not pre-load central assets cache:", err);
      setAssets(getMockAssets());
      if ((window as any).firestoreQuotaExceeded) {
        setFirestoreQuotaExceeded(true);
      }
    });

    initAuth(
      async (firebaseUser, token) => {
        const email = firebaseUser.email || 'operator@pea.co.th';
        const registered = findUserByEmail(email);

        if (registered?.status === 'pending' && !isAdminAccount(email)) {
          setShowGameLoading(false);
          setIsLoading(false);
          setNeedsAuth(true);
          setErrorMessage(
            `Account Registration Pending Admin Authorization. Request ID: ${registered.requestId || 'REQ-PEA-92810'}. Employee ID: ${registered.employeeId || 'PEA-58291'}. Notice sent to PEA Executive Admin.`
          );
          return;
        }

        if (registered?.status === 'rejected' && !isAdminAccount(email)) {
          setShowGameLoading(false);
          setIsLoading(false);
          setNeedsAuth(true);
          setErrorMessage(`Account registration request was declined by PEA Executive Admin.`);
          return;
        }

        const currentSelectedArea = selectedAreaRef.current;
        const currentSelectedRole = selectedRoleRef.current;
        const activeRole: UserRole = registered ? registered.role : currentSelectedRole;
        const allowedArea = registered ? registered.interestArea : null;

        if (activeRole === 'Local Operator' && allowedArea && allowedArea !== 'ALL' && currentSelectedArea !== allowedArea) {
          setShowGameLoading(false);
          setIsLoading(false);
          setNeedsAuth(true);
          setErrorMessage(
            `Access Denied: You have no permission to access ${currentSelectedArea} area. The area ${allowedArea} (${PEA_AREA_NAMES[allowedArea] || allowedArea}) is allowed for this account.`
          );
          return;
        }

        const activeArea = (activeRole === 'Admin' || activeRole === 'Manager') ? 'ALL' : (registered ? registered.interestArea : currentSelectedArea);

        setGoogleToken(token);
        setShowGameLoading(true);
        
        if (token) {
          await handleAutoDiscovery(token, email, activeArea, activeRole);
        }

        setUser({
          uid: firebaseUser.uid,
          email,
          name: registered?.name || firebaseUser.displayName || 'PEA Operator',
          role: activeRole,
          interestArea: activeArea
        });

        if (activeRole === 'Admin' || activeRole === 'Manager') {
          setActiveTab('admin');
        } else {
          setActiveTab('area');
        }

        setNeedsAuth(false);
      },
      () => {
        setNeedsAuth(true);
      }
    );

    // Load central backup or local storage assets if present
    const backupSaved = localStorage.getItem('pea_central_assets_backup');
    if (backupSaved) {
      try {
        const parsed = JSON.parse(backupSaved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAssets(prev => (prev && prev.length >= 100 ? prev : parsed));
        }
      } catch (e) {}
    }
  }, []);

  // Counter to ensure newer sheet fetch sessions supersede older ones
  const fetchSessionCounterRef = React.useRef<number>(0);

  // Load spreadsheet data once spreadsheetId is verified
  const handleLoadSpreadsheet = async (token: string, sheetIds: string[], isAdminUser = false, isForceRefresh = false) => {
    if (!token) return;
    let uniqueIds = Array.from(new Set(sheetIds)).filter(id => id && id.trim().length > 0);

    // Auto-discover if we have fewer than 12 regional sheets
    if (uniqueIds.length < 12) {
      try {
        const discovered = await autoDiscoverAndSync(token);
        if (discovered.spreadsheets) {
          const discoveredIds = Object.values(discovered.spreadsheets).filter(Boolean);
          uniqueIds = Array.from(new Set([...uniqueIds, ...discoveredIds]));
        }
      } catch (e) {
        console.warn('Auto-discovery error during sheet load:', e);
      }
    }

    if (uniqueIds.length === 0) return;

    if (isForceRefresh) {
      clearCentralAssetsCache();
    }

    // Increment fetch session counter so a newer call with all 12 sheets supersedes any older call
    const currentSession = ++fetchSessionCounterRef.current;

    setIsSyncingCentralDb(true);
    setIsLoading(true);
    setErrorMessage('');
    setSyncSuccessMessage(null);
    setSyncProgress({ current: 0, total: uniqueIds.length, statusText: 'Connecting to Admin Central Google Sheets...' });

    // Pre-load Firestore central assets cache immediately into an asset map unless force refresh requested
    const assetMap = new Map<string, CableAsset>();
    if (!isForceRefresh) {
      try {
        const cached = await getCentralAssetsCache();
        if (cached && cached.length > 0) {
          cached.forEach(a => {
            const key = a.equipmentId ? a.equipmentId.trim() : `ROW_${a.number}`;
            assetMap.set(key, a);
          });
          setAssets(Array.from(assetMap.values()));
        }
      } catch (e) {
        console.warn('Error preloading central cache:', e);
      }
    }

    let successfulSectors = 0;
    let failedSectors = 0;

    try {
      for (let i = 0; i < uniqueIds.length; i++) {
        if (currentSession !== fetchSessionCounterRef.current) {
          console.log(`Sheet fetch session ${currentSession} superseded by newer session ${fetchSessionCounterRef.current}`);
          return;
        }
        const id = uniqueIds[i];
        setSyncProgress({
          current: i + 1,
          total: uniqueIds.length,
          statusText: `Fetching sector ${i + 1} of ${uniqueIds.length} from Admin Central Drive... (${assetMap.size.toLocaleString()} assets active)`
        });

        if (i > 0) {
          // Add 150ms delay between consecutive spreadsheet batch gets to avoid HTTP 429 rate limit
          await new Promise(resolve => setTimeout(resolve, 150));
        }

        if (currentSession !== fetchSessionCounterRef.current) return;

        let sectorData: CableAsset[] | null = null;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts && !sectorData) {
          attempts++;
          try {
            sectorData = await fetchSheetsData(token, id);
          } catch (err: any) {
            if (err.message?.includes('Status: 404')) {
              console.warn(`Spreadsheet ${id} not found.`);
              break;
            }
            console.warn(`Attempt ${attempts}/${maxAttempts} failed for sheet ${id}:`, err);
            if (attempts < maxAttempts) {
              await new Promise(r => setTimeout(r, 800 * attempts));
            }
          }
        }

        if (currentSession !== fetchSessionCounterRef.current) return;

        if (sectorData && Array.isArray(sectorData)) {
          successfulSectors++;

          // STALE CACHE EVICTION FOR THIS SPREADSHEET / SECTOR:
          // Determine the sector area prefix from live sheet data
          let targetSectorArea = '';
          if (sectorData.length > 0) {
            const first = sectorData[0];
            if (first.equipmentId) {
              targetSectorArea = first.equipmentId.split('-')[0]?.trim().toUpperCase() || '';
            }
            if (!targetSectorArea && first.peaNumber) {
              targetSectorArea = first.peaNumber.split('-')[1]?.trim().toUpperCase() || '';
            }
          }

          // Delete all previously cached entries in assetMap originating from this spreadsheetId or sector area
          for (const [key, existingAsset] of Array.from(assetMap.entries())) {
            const matchSheet = existingAsset.spreadsheetId === id;
            const matchArea = targetSectorArea && (
              existingAsset.equipmentId?.split('-')[0]?.trim().toUpperCase() === targetSectorArea ||
              (existingAsset as any).peaArea === targetSectorArea
            );
            if (matchSheet || matchArea) {
              assetMap.delete(key);
            }
          }

          // Insert fresh live rows from Google Sheets
          sectorData.forEach(a => {
            const key = a.equipmentId ? a.equipmentId.trim() : `ROW_${a.number}`;
            assetMap.set(key, a);
          });

          // Progressive update so dashboard updates live
          setAssets(Array.from(assetMap.values()));
        } else {
          failedSectors++;
          console.warn(`Sector sheet ${id} returned 0 records or failed after ${maxAttempts} attempts. Retaining cached assets for this sector.`);
        }
      }

      if (currentSession !== fetchSessionCounterRef.current) return;

      const finalAssets = Array.from(assetMap.values());

      if (finalAssets.length > 0) {
        setAssets(finalAssets);
        // Force save to central cache to sync clean live Google Sheets data across all users
        saveCentralAssetsCache(finalAssets, true).catch(() => {});
        try {
          localStorage.setItem('pea_central_assets_backup', JSON.stringify(finalAssets));
        } catch (e) {}
        updateLastFetchedTimestamp();

        if (failedSectors === 0) {
          setSyncSuccessMessage(`Central Database Synchronized! 100% Verified with Google Sheets. Fully loaded ${finalAssets.length.toLocaleString()} cable assets across ${uniqueIds.length} sectors.`);
        } else {
          setSyncSuccessMessage(`Central Database Synchronized! Loaded ${finalAssets.length.toLocaleString()} cable assets (${successfulSectors}/${uniqueIds.length} sectors live).`);
        }
      } else {
        let loaded = false;
        try {
          const cached = await getCentralAssetsCache();
          if (cached && cached.length > 0) {
            console.log("Loaded Central Admin Database from Firestore chunked cache:", cached.length);
            setAssets(cached);
            setSyncSuccessMessage(`Loaded ${cached.length.toLocaleString()} cable assets from Firestore Central Database.`);
            loaded = true;
          }
        } catch (e) {}

        if (!loaded) {
          const backup = localStorage.getItem('pea_central_assets_backup');
          if (backup) {
            try {
              const parsed = JSON.parse(backup);
              if (parsed && parsed.length > 0) {
                setAssets(parsed);
                setSyncSuccessMessage(`Loaded ${parsed.length.toLocaleString()} assets from local backup.`);
                loaded = true;
              }
            } catch (e) {}
          }
        }

        if (!loaded && assets.length === 0) {
          setAssets(getMockAssets());
          setSyncSuccessMessage("Central Database offline. Loaded offline backup telemetry datasets.");
        }

        if ((window as any).firestoreQuotaExceeded) {
          setFirestoreQuotaExceeded(true);
        }
      }
    } catch (err: any) {
      console.warn('handleLoadSpreadsheet error:', err);
      const finalAssets = Array.from(assetMap.values());
      if (finalAssets.length > 0) {
        setAssets(finalAssets);
        setSyncSuccessMessage(`Central Database Active! Loaded ${finalAssets.length.toLocaleString()} cable assets.`);
      } else {
        setAssets(getMockAssets());
        setSyncSuccessMessage("Central Database offline. Loaded offline backup telemetry datasets.");
      }
    } finally {
      setIsLoading(false);
      setIsSyncingCentralDb(false);
    }
  };

  // Batch Equipment ID Migration across all 12 PEA Google Sheets
  const handleBatchMigrateEquipmentIds = async () => {
    if (!googleToken) {
      alert("Please sign in with a Google Account to scan and update Equipment IDs in Google Sheets.");
      return;
    }
    setIsMigratingIds(true);
    setSyncSuccessMessage("Scanning and revising Column AG Equipment IDs across all 12 PEA Google Sheets...");
    try {
      const result = await migrateAll12GoogleSheetsEquipmentIds(googleToken);
      const breakdownText = Object.entries(result.areaBreakdown)
        .map(([areaCode, count]) => `Area ${areaCode}: ${count}`)
        .join(', ');
      
      const msg = `Batch Equipment ID Migration Completed! Checked ${result.totalSpreadsheets} Google Sheets files. Revised ${result.totalUpdates} Equipment ID cell(s)${breakdownText ? ` (${breakdownText})` : ''} to comply with the latest PEA rules.`;
      setSyncSuccessMessage(msg);
      alert(msg);

      if (spreadsheetIds.length > 0 || spreadsheetId) {
        const idsToFetch = spreadsheetIds.length > 0 ? spreadsheetIds : [spreadsheetId!];
        await handleLoadSpreadsheet(googleToken, idsToFetch, true);
      }
    } catch (err: any) {
      console.error("Batch Equipment ID migration error:", err);
      alert(`Equipment ID Migration Error: ${err.message || 'Failed to update sheets'}`);
    } finally {
      setIsMigratingIds(false);
    }
  };

  // Trigger spreadsheet load on change across ALL registered roles
  useEffect(() => {
    if (googleToken && (spreadsheetId || spreadsheetIds.length > 0)) {
      const idsToFetch = spreadsheetIds.length > 0 ? spreadsheetIds : (spreadsheetId ? [spreadsheetId] : []);
      const isAdminUser = user?.role === 'Admin' || (user?.email ? isAdminAccount(user.email) : false);
      handleLoadSpreadsheet(googleToken, idsToFetch, isAdminUser);
    }
  }, [googleToken, spreadsheetId, spreadsheetIds, user?.role, user?.email]);

  // Handle tab switching with page transition loading screen
  const handleTabChange = (newTab: 'admin' | 'area' | 'input' | 'records' | 'registration') => {
    if (newTab === activeTab) return;
    setIsPageSwitching(true);
    setActiveTab(newTab);
    setTimeout(() => {
      setIsPageSwitching(false);
    }, 600);
  };

  // Authenticate Google account
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setErrorMessage('');
    try {
      const result = await googleSignIn();
      if (result) {
        const email = result.user.email || 'operator@pea.co.th';
        const name = result.user.displayName || 'PEA Operator';
        const uid = result.user.uid;
        const accessToken = result.accessToken;

        // Check if user is registered in database or recognized as Admin
        const registered = findUserByEmail(email);
        const isUserAdmin = isAdminAccount(email) || registered?.role === 'Admin';

        if (isUserAdmin) {
          // Open 3-role popup modal for Admin account
          setPendingAdminUser({
            uid,
            email,
            name: registered?.name || name,
            accessToken
          });
          setModalRoleChoice('Admin');
          setShowAdminRoleModal(true);
          setIsLoggingIn(false);
          return;
        }

        const activeRole: UserRole = registered ? registered.role : selectedRole;
        const activeArea = (activeRole === 'Admin' || activeRole === 'Manager') ? 'ALL' : (registered ? registered.interestArea : selectedArea);

        await finalizeUserSession(email, registered?.name || name, uid, activeRole, activeArea, accessToken);
      } else {
        setErrorMessage('Sign-in cancelled. Please complete authentication in the popup window.');
      }
    } catch (err: any) {
      setErrorMessage(`Login failure: ${err.message || 'Unable to sign in'}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Alternative redirect sign-in when browser popup blocker is active
  const handleRedirectLogin = async () => {
    setIsLoggingIn(true);
    setErrorMessage('');
    try {
      await googleSignInWithRedirect();
    } catch (err: any) {
      setErrorMessage(`Redirect Sign-in failure: ${err.message || 'Unable to redirect'}`);
      setIsLoggingIn(false);
    }
  };

  // Skip direct login to test dashboard instantly using mock database
  const handleGuestLogin = async (customEmail?: string) => {
    const emailToUse = customEmail || (selectedRole === 'Manager' ? 'moskmitl50@gmail.com' : 'guest.operator@pea.co.th');
    const registered = findUserByEmail(emailToUse);
    const isUserAdmin = isAdminAccount(emailToUse) || registered?.role === 'Admin' || (customEmail ? false : selectedRole === 'Admin');

    if (isUserAdmin) {
      setPendingAdminUser({
        uid: 'guest-admin-999',
        email: emailToUse,
        name: registered?.name || 'PEA Executive Admin',
        isGuest: true
      });
      setModalRoleChoice('Admin');
      setShowAdminRoleModal(true);
      return;
    }

    const activeRole: UserRole = registered ? registered.role : selectedRole;
    const activeArea = (activeRole === 'Admin' || activeRole === 'Manager') ? 'ALL' : (registered ? registered.interestArea : selectedArea);

    await finalizeUserSession(
      emailToUse,
      registered?.name || (activeRole === 'Manager' ? 'Mos KMITL (Manager)' : 'Guest PEA Operator'),
      'guest-PEA-999',
      activeRole,
      activeArea,
      null
    );
  };

  // Confirm role choice from Admin Modal
  const handleConfirmAdminRoleChoice = async () => {
    if (!pendingAdminUser) return;
    setShowAdminRoleModal(false);

    const { email, name, uid, accessToken } = pendingAdminUser;
    const registered = findUserByEmail(email);
    const activeArea = (modalRoleChoice === 'Admin' || modalRoleChoice === 'Manager') ? 'ALL' : (registered ? registered.interestArea : selectedArea);

    await finalizeUserSession(
      email,
      name,
      uid || 'admin-user-id',
      modalRoleChoice,
      activeArea,
      accessToken || null
    );

    setPendingAdminUser(null);
  };

  // Handle Account Registration / Sign Up
  const handleSignUp = (e: FormEvent) => {
    e.preventDefault();
    if (!signUpEmail || !signUpEmail.includes('@')) {
      setErrorMessage('Please enter a valid Gmail or PEA account email.');
      return;
    }
    if (!signUpName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!signUpEmployeeId.trim()) {
      setErrorMessage('Please enter your PEA Employee ID.');
      return;
    }

    const reqNum = Math.floor(10000 + Math.random() * 90000);
    const newUser: PEAUser = {
      email: signUpEmail.trim().toLowerCase(),
      name: signUpName.trim(),
      employeeId: signUpEmployeeId.trim().toUpperCase(),
      requestId: `REQ-PEA-${reqNum}`,
      status: 'pending',
      role: signUpRole,
      interestArea: (signUpRole === 'Admin' || signUpRole === 'Manager') ? 'ALL' : signUpArea
    };

    saveUserAccount(newUser);
    setSignUpSuccessMsg(
      `Registration Request ${newUser.requestId} Submitted! Employee ID: ${newUser.employeeId}. Status: PENDING ADMIN APPROVAL. An authorization notice has been dispatched to PEA Executive Admin.`
    );
    setErrorMessage('');
    
    // Auto fill email / switch back to Sign In
    setTimeout(() => {
      setLoginMode('signin');
      if (newUser.role === 'Local Operator' || newUser.role === 'Manager') {
        setSelectedRole(newUser.role);
      }
      if (newUser.interestArea !== 'ALL') {
        setSelectedArea(newUser.interestArea);
      }
    }, 2500);
  };

  // Create clean Google Sheets & Drive template automatically
  const handleCreateDatabaseTemplate = async () => {
    if (!googleToken || !user) return;
    setIsCreatingSheet(true);
    setErrorMessage('');
    try {
      const areaToUse = (user.role === 'Admin' || user.role === 'Manager') ? 'ALL' : user.interestArea;
      const { spreadsheetId: newSheetId, folderId: newFolderId } = await createSheetsTemplate(googleToken, areaToUse);
      
      // Persist spreadsheet associations
      if (user.role === 'Admin' || user.role === 'Manager') {
        setSpreadsheetIds(prev => [...prev, newSheetId]);
      } else {
        setSpreadsheetId(newSheetId);
        setFolderId(newFolderId);
        localStorage.setItem(`pea_sheet_id_${user.email}`, newSheetId);
        localStorage.setItem(`pea_folder_id_${user.email}`, newFolderId);
      }
      
      await saveSectorSpreadsheet(areaToUse, newSheetId, newFolderId);
      await handleLoadSpreadsheet(googleToken, [newSheetId]);

      alert('Successfully created "PEA Cable Asset Database" template in your Google Drive!');
    } catch (err: any) {
      setErrorMessage(`Database Template Error: ${err.message || 'Unable to provision spreadsheet.'}`);
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setGoogleToken(null);
    setSpreadsheetId(null);
    setFolderId(null);
    setNeedsAuth(true);
    // Preserve central database assets
    getCentralAssetsCache().then(cached => {
      if (cached && cached.length > 0) {
        setAssets(cached);
      } else {
        setAssets(getMockAssets());
      }
    }).catch(() => {
      setAssets(getMockAssets());
    });
  };

  // Auto sign-out system when user has no activity for 30 minutes
  useEffect(() => {
    if (!user || needsAuth) return;

    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const resetInactivityTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        alert("Inactivity Timeout: You have been automatically signed out due to 30 minutes of inactivity.");
        handleLogout();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const userActivityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    userActivityEvents.forEach(evt => {
      window.addEventListener(evt, resetInactivityTimer, { passive: true });
    });

    // Start timer upon sign in
    resetInactivityTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      userActivityEvents.forEach(evt => {
        window.removeEventListener(evt, resetInactivityTimer);
      });
    };
  }, [user, needsAuth]);

  // Re-fetch spreadsheet assets across ALL registered roles
  const handleManualRefresh = () => {
    clearCentralAssetsCache();
    const idsToFetch = spreadsheetIds.length > 0 ? spreadsheetIds : (spreadsheetId ? [spreadsheetId] : []);
    const isAdminUser = user?.role === 'Admin' || (user?.email ? isAdminAccount(user.email) : false);
    if (googleToken && idsToFetch.length > 0) {
      handleLoadSpreadsheet(googleToken, idsToFetch, isAdminUser, true);
    } else {
      // Reload from central Firestore cache with force refresh
      getCentralAssetsCache(true).then(cached => {
        if (cached && cached.length > 0) {
          setAssets(cached);
          setSyncSuccessMessage(`Central Admin Database Refreshed! Loaded ${cached.length.toLocaleString()} cable assets from Admin Google Sheets database.`);
        } else {
          const localSaved = localStorage.getItem('pea_central_assets_backup');
          if (localSaved) {
            try {
              const parsed = JSON.parse(localSaved);
              if (parsed && parsed.length > 0) {
                setAssets(parsed);
                return;
              }
            } catch (e) {}
          }
          if (assets.length === 0) {
            setAssets(getMockAssets());
          }
        }
        if ((window as any).firestoreQuotaExceeded) {
          setFirestoreQuotaExceeded(true);
        }
      }).catch(() => {
        const localSaved = localStorage.getItem('pea_central_assets_backup');
        if (localSaved) {
          try {
            const parsed = JSON.parse(localSaved);
            if (parsed && parsed.length > 0) {
              setAssets(parsed);
              return;
            }
          } catch (e) {}
        }
        if (assets.length === 0) {
          setAssets(getMockAssets());
        }
        if ((window as any).firestoreQuotaExceeded) {
          setFirestoreQuotaExceeded(true);
        }
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800 relative" id="pea-app-root">
      
      {/* GAME-STYLE LOADING SCREEN (ON INITIAL AUTH / LOGIN) */}
      {showGameLoading && (
        <GameLoadingScreen 
          title="PSMD CABLE ASSET INTEGRITY SYSTEM"
          subtitle="Power System Management Division - Authenticating PEA User Session..."
          isConnecting={isLoggingIn || isLoading}
          onComplete={() => setShowGameLoading(false)} 
        />
      )}

      {/* FLOATING CENTRAL DATABASE SYNC POPUP NOTIFICATION FOR MANAGER & USERS */}
      {!showGameLoading && !needsAuth && user && (isSyncingCentralDb || syncSuccessMessage) && (
        <div className="fixed bottom-6 right-6 z-[9999] max-w-md w-full bg-slate-900/95 border-2 border-purple-500/80 rounded-2xl p-4 shadow-2xl text-white font-sans animate-fade-in flex flex-col gap-3 backdrop-blur-md">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-xl mt-0.5 ${isSyncingCentralDb ? 'bg-purple-900/80 text-yellow-400 border border-purple-500/50' : 'bg-emerald-900/80 text-emerald-400 border border-emerald-500/50'}`}>
                {isSyncingCentralDb ? (
                  <Database className="w-5 h-5 animate-pulse text-yellow-400" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  {isSyncingCentralDb ? "PEA Central DB Sync in Progress" : "Database Synchronized"}
                  <span className="text-[10px] font-mono bg-purple-950 text-purple-300 px-2 py-0.5 rounded-full border border-purple-800">
                    Admin Google Sheets
                  </span>
                </h4>
                <p className="text-xs text-gray-300 mt-1 leading-snug">
                  {isSyncingCentralDb 
                    ? (syncProgress.statusText || "Synchronizing 12 regional cable sector spreadsheets from Admin central database...") 
                    : syncSuccessMessage}
                </p>
              </div>
            </div>
            <button 
              onClick={() => { setSyncSuccessMessage(null); setIsSyncingCentralDb(false); }}
              className="text-gray-400 hover:text-white p-1 transition-colors rounded-lg"
              title="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress Bar when syncing */}
          {isSyncingCentralDb && syncProgress.total > 0 && (
            <div className="w-full space-y-1 mt-1">
              <div className="flex justify-between text-[11px] font-mono text-purple-300">
                <span>Sector: {syncProgress.current}/{syncProgress.total}</span>
                <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-purple-900">
                <div 
                  className="bg-gradient-to-r from-purple-500 via-yellow-400 to-emerald-400 h-full rounded-full transition-all duration-300" 
                  style={{ width: `${Math.max(5, Math.round((syncProgress.current / syncProgress.total) * 100))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* PAGE SWITCH OVERLAY (ON TAB SWITCH) */}
      {isPageSwitching && (
        <GameLoadingScreen 
          isOverlay 
          title={`LOADING ${activeTab.toUpperCase()} TELEMETRY`}
          subtitle="Synchronizing Regional Sensors..."
          onComplete={() => setIsPageSwitching(false)} 
        />
      )}

      {/* 1. AUTHENTICATION & LOGIN PAGE */}
      {needsAuth || !user ? (
        <div className="flex-1 flex items-center justify-center p-4 min-h-screen bg-gradient-to-tr from-purple-950 via-slate-900 to-slate-950">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden w-full max-w-md border border-purple-100 flex flex-col p-6 sm:p-8 space-y-5">
            
            {/* PEA Official Header Emblem */}
            <div className="text-center space-y-2">
              <div className="flex justify-center py-2 px-4 bg-purple-50/60 rounded-2xl border border-purple-100/80 shadow-xs">
                <PeaLogo variant="full" className="h-12 sm:h-14" />
              </div>
              <p className="text-[11px] text-purple-900 font-black tracking-widest uppercase">Provincial Electricity Authority</p>
              <p className="text-[11px] text-purple-700 font-bold tracking-tight">Cable management web application</p>
            </div>

            {/* Single Latest Notification Callout on Login Screen */}
            {errorMessage ? (
              <div className="bg-red-50 border border-red-200 text-red-800 text-xs p-3.5 rounded-2xl font-medium space-y-2.5 shadow-xs transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                    <span className="leading-relaxed font-semibold">{errorMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorMessage('')}
                    className="shrink-0 bg-red-100 hover:bg-red-200 text-red-900 px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer flex items-center gap-1 border border-red-300/80 active:scale-95"
                    title="Acknowledge and clear notification"
                  >
                    <CheckCircle2 className="w-3 h-3 text-red-700" />
                    Acknowledge
                  </button>
                </div>
                {(errorMessage.toLowerCase().includes('popup') || errorMessage.toLowerCase().includes('blocked')) && (
                  <div className="pt-2 border-t border-red-200/60 flex flex-col gap-2">
                    <p className="text-[11px] text-red-900 font-bold">
                      Popup blocked by browser? Choose an alternative method:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleRedirectLogin}
                        className="w-full bg-purple-900 hover:bg-purple-950 text-white py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Sign In via Redirect
                      </button>
                      <a
                        href={window.location.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-white border border-red-200 hover:bg-red-100/50 text-red-900 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-center"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        Open App in New Tab
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : signUpSuccessMsg ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-2xl font-medium flex items-center justify-between gap-3 shadow-xs transition-all">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span className="font-semibold leading-relaxed">{signUpSuccessMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSignUpSuccessMsg('')}
                  className="shrink-0 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer flex items-center gap-1 border border-emerald-300/80 active:scale-95"
                  title="Acknowledge and clear notification"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                  Acknowledge
                </button>
              </div>
            ) : null}

            {/* SIGN IN TAB CONTENT */}
            {loginMode === 'signin' && (
              <div className="space-y-4">
                {/* 2-Option System Role Selector (Local Operator vs Manager) */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">System Role Selection</label>
                    <span className="text-[9px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                      2 Default Login Roles
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1.5 rounded-xl border border-gray-200/60">
                    <button
                      type="button"
                      onClick={() => { setSelectedRole('Local Operator'); if (selectedArea === 'ALL') setSelectedArea('N1'); }}
                      className={`py-2.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                        selectedRole === 'Local Operator' 
                          ? 'bg-purple-900 text-white shadow-sm' 
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50'
                      }`}
                    >
                      <span>Local Operator</span>
                      <span className={`text-[9px] font-normal ${selectedRole === 'Local Operator' ? 'text-purple-200' : 'text-gray-400'}`}>Field Inspection</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedRole('Manager'); setSelectedArea('ALL'); }}
                      className={`py-2.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                        selectedRole === 'Manager' 
                          ? 'bg-purple-900 text-white shadow-sm' 
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50'
                      }`}
                    >
                      <span>Manager</span>
                      <span className={`text-[9px] font-normal ${selectedRole === 'Manager' ? 'text-purple-200' : 'text-gray-400'}`}>Regional Oversight</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Select Regional Sector</label>
                  {selectedRole === 'Manager' || selectedRole === 'Admin' ? (
                    <div className="w-full bg-purple-50 border border-purple-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-purple-900 flex items-center justify-between">
                      <span>ALL - All Areas (National)</span>
                      <span className="text-[10px] font-semibold bg-purple-200/80 text-purple-900 px-2 py-0.5 rounded-full">
                        Fixed for {selectedRole}
                      </span>
                    </div>
                  ) : (
                    <select
                      value={selectedArea}
                      onChange={e => setSelectedArea(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-gray-700 focus:outline-hidden focus:ring-1 focus:ring-purple-700 focus:bg-white"
                    >
                      {PEA_AREAS.map(area => (
                        <option key={area} value={area}>
                          PEA Area {area} - {PEA_AREA_NAMES[area]}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="text-[10px] text-gray-400 italic font-medium">
                    * Regional sector filters telemetry data and equipment records.
                  </span>
                </div>

                {/* Login CTA buttons */}
                <div className="space-y-3 pt-3 border-t border-gray-100">
                  {isIframe && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-amber-800 text-[11px] leading-relaxed space-y-1.5">
                      <div className="font-bold flex items-center gap-1.5 text-amber-900">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                        Browser Preview Boundary
                      </div>
                      <p className="text-[10px]">
                        For full Google Sheets access, open app in a new tab.
                      </p>
                      <a
                        href={window.location.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-center"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        Open App in New Tab
                      </a>
                    </div>
                  )}

                  {/* Google sign-in primary option */}
                  <button
                    disabled={isLoggingIn}
                    onClick={handleLogin}
                    className="w-full bg-purple-900 hover:bg-purple-950 text-white py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2.5 shadow-md active:scale-98 transition-all cursor-pointer"
                  >
                    <svg className="w-4 h-4 shrink-0" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    {isLoggingIn ? 'Authenticating Session...' : 'Sign in with Google Account'}
                  </button>

                  {/* Sign Up button at bottom of Sign In view */}
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => { setLoginMode('signup'); setErrorMessage(''); setSignUpSuccessMsg(''); }}
                      className="w-full bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-purple-700" />
                      Sign Up New Account
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* SIGN UP TAB CONTENT */}
            {loginMode === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-3">
                <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100 text-[11px] text-purple-900 font-medium">
                  Create a new PEA Cable Integrity account. Requires Employee ID and Admin approval authorization.
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">PEA Employee ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PEA-58291"
                    value={signUpEmployeeId}
                    onChange={e => setSignUpEmployeeId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-xs font-semibold text-gray-800 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Gmail / PEA Email Account *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. moskmitl50@gmail.com"
                    value={signUpEmail}
                    onChange={e => setSignUpEmail(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-xs font-semibold text-gray-800 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Full Name / Operator Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mos KMITL"
                    value={signUpName}
                    onChange={e => setSignUpName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-xs font-semibold text-gray-800 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Assigned Regional Sector</label>
                  {signUpRole === 'Manager' || signUpRole === 'Admin' ? (
                    <div className="w-full bg-purple-50 border border-purple-200 rounded-xl py-2 px-3 text-xs font-bold text-purple-900 flex items-center justify-between">
                      <span>ALL - All Areas (National)</span>
                      <span className="text-[9px] font-semibold bg-purple-200/80 text-purple-900 px-2 py-0.5 rounded-full">
                        Fixed for {signUpRole}
                      </span>
                    </div>
                  ) : (
                    <select
                      value={signUpArea}
                      onChange={e => setSignUpArea(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-xs font-bold text-gray-800 focus:outline-hidden focus:border-purple-600 focus:bg-white"
                    >
                      {PEA_AREAS.map(area => (
                        <option key={area} value={area}>
                          PEA Area {area} - {PEA_AREA_NAMES[area]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Requested System Role</label>
                  <div className="grid grid-cols-3 gap-1.5 bg-gray-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => { setSignUpRole('Local Operator'); if (signUpArea === 'ALL') setSignUpArea('N1'); }}
                      className={`py-1.5 px-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                        signUpRole === 'Local Operator' ? 'bg-purple-900 text-white' : 'text-gray-600'
                      }`}
                    >
                      Local Operator
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSignUpRole('Manager'); setSignUpArea('ALL'); }}
                      className={`py-1.5 px-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                        signUpRole === 'Manager' ? 'bg-purple-900 text-white' : 'text-gray-600'
                      }`}
                    >
                      Manager
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSignUpRole('Admin'); setSignUpArea('ALL'); }}
                      className={`py-1.5 px-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                        signUpRole === 'Admin' ? 'bg-purple-900 text-white' : 'text-gray-600'
                      }`}
                    >
                      Admin
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-purple-900 hover:bg-purple-950 text-white py-2.5 px-4 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer text-center mt-2 flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Submit Registration & Request Admin Authorization
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => { setLoginMode('signin'); setErrorMessage(''); setSignUpSuccessMsg(''); }}
                    className="text-xs font-bold text-purple-800 hover:text-purple-950 underline cursor-pointer"
                  >
                    Already registered? Back to Sign In
                  </button>
                </div>
              </form>
            )}

            <div className="text-[10px] text-gray-400 text-center leading-relaxed font-medium pt-3 border-t border-gray-100 space-y-1">
              <p>Provincial Electricity Authority (Headquarter), Thailand. All right reserved.</p>
              <p className="text-purple-900/90 font-bold">Power system management division, Telephone 02-590-5465</p>
            </div>
          </div>
        </div>
      ) : (
        
        // 2. MAIN APPLICATION WORKSPACE WITH YOUTUBE SIDEBAR
        <div className="flex min-h-screen">
          
          {/* Collapsible YouTube Left Sidebar Navigation */}
          <Sidebar 
            activeTab={activeTab}
            setActiveTab={handleTabChange}
            user={user}
            onLogout={handleLogout}
            googleToken={googleToken}
            spreadsheetId={spreadsheetId}
            spreadsheetIds={spreadsheetIds}
            isCreatingSheet={isCreatingSheet}
            isLoading={isLoading}
            onCreateTemplate={handleCreateDatabaseTemplate}
            onDisconnect={() => {
              if (user) {
                localStorage.removeItem(`pea_sheet_id_${user.email}`);
                localStorage.removeItem(`pea_folder_id_${user.email}`);
              }
              setSpreadsheetId(null);
              setSpreadsheetIds([]);
              setFolderId(null);
              setAssets(getMockAssets());
            }}
            onRefresh={handleManualRefresh}
          />

          {/* Main Content Area */}
          <div className="flex-1 pl-16 flex flex-col min-w-0">
            
            {/* Top Toolbar Header */}
            <header className="bg-white border-b border-gray-100 px-6 py-3.5 sticky top-0 z-[5000] shadow-2xs">
              <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
                
                {/* Sector Information & Title */}
                <div className="flex items-center gap-3">
                  <PeaLogo className="w-9 h-9" />
                  <div>
                    <h1 className="text-sm font-black text-purple-950 uppercase tracking-tight flex items-center gap-2">
                      PEA-PSMD Cable Management
                      <span className="text-[9px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200/60 rounded-full px-2 py-0.5 normal-case">
                        {activeTab === 'admin' ? 'Board Portfolio' : activeTab === 'area' ? 'Area Telemetry' : activeTab === 'input' ? 'Submit Log' : activeTab === 'registration' ? 'Asset Registration' : 'Asset Catalog'}
                      </span>
                    </h1>
                    <p className="text-[10px] text-gray-500 font-medium">
                      Sector: <strong className="text-purple-900 font-bold">{user.interestArea} - {PEA_AREA_NAMES[user.interestArea] || 'All Sectors'}</strong> | Logged as: <span className="font-semibold">{user.name} ({user.role})</span>
                    </p>
                  </div>
                </div>

                {/* Right Status Badges */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 justify-end">
                  {lastFetchedTime && (
                    <div 
                      className="flex items-center gap-1.5 text-[10px] sm:text-[11px] bg-slate-100/90 text-slate-700 border border-slate-200/90 px-2.5 py-1.5 rounded-xl font-medium shrink-0"
                      title="Exact date and time central asset database was last fetched / synchronized"
                    >
                      <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Last Fetched: <strong className="font-bold text-slate-900">{formatLastFetchedTime(lastFetchedTime)}</strong></span>
                    </div>
                  )}

                  {googleToken ? (
                    (spreadsheetId || spreadsheetIds.length > 0) ? (
                      <div className="flex items-center gap-1.5 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl font-bold">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Google Sheets Connected</span>
                      </div>
                    ) : isLoading ? (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-xl text-[11px] text-yellow-800 font-bold animate-pulse">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-yellow-700" />
                        <span>Syncing Google Drive...</span>
                      </div>
                    ) : (
                      <button
                        disabled={isCreatingSheet}
                        onClick={handleCreateDatabaseTemplate}
                        className="text-[11px] bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-purple-700" />
                        {isCreatingSheet ? 'Creating Template...' : 'Initialize Sheets Database'}
                      </button>
                    )
                  ) : (
                    <div className="text-[10px] text-slate-500 font-semibold bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                      Local Offline Mode
                    </div>
                  )}

                  <button
                    onClick={handleManualRefresh}
                    className="p-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-lg cursor-pointer transition-colors"
                    title="Refresh Telemetry Data"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-purple-700' : ''}`} />
                  </button>
                </div>

              </div>
            </header>

            {/* Firestore Quota Exceeded Warn Callout */}
            {firestoreQuotaExceeded && (
              <div className="bg-yellow-50 border-b border-yellow-200 py-3 px-6 animate-fade-in">
                <div className="max-w-7xl mx-auto text-xs text-yellow-800 font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-yellow-600" />
                    <div>
                      <strong className="font-bold mr-1">Firestore Quota Exhausted (Daily Limit Exceeded):</strong>
                      The central Firestore cache has run out of its free daily read/write quota. The system has automatically activated offline local-backup & mock telemetry datasets so you can keep working normally.
                    </div>
                  </div>
                  <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                    <a
                      href="https://console.firebase.google.com/project/project576-2f16f/firestore/databases/ai-studio-cableassetmonito-f1b7af06-76bc-4f75-8b70-746fc95eea3c/data?openUpgradeDialog=true"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-yellow-100 hover:bg-yellow-200 text-yellow-900 border border-yellow-300 font-bold px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1 shrink-0"
                    >
                      Open Firebase Console
                      <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => setFirestoreQuotaExceeded(false)} className="text-yellow-600 hover:text-yellow-800 font-bold hover:underline text-[11px]">Dismiss</button>
                  </div>
                </div>
              </div>
            )}

            {/* Error Callout */}
            {errorMessage && (
              <div className="bg-red-50 border-b border-red-100 py-2.5 px-6">
                <div className="max-w-7xl mx-auto text-xs text-red-700 font-semibold flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{errorMessage}</span>
                  </div>
                  <button onClick={() => setErrorMessage('')} className="text-red-500 font-bold hover:underline">Dismiss</button>
                </div>
              </div>
            )}

            {/* Main Content View */}
            <main className="flex-grow max-w-7xl mx-auto w-full p-6">
              
              {/* VIEW 1: BOARD/ADMINISTRATOR PORTFOLIO PAGE */}
              {activeTab === 'admin' && (user.role === 'Admin' || user.role === 'Manager') && (
                <AdminDashboard 
                  assets={assets} 
                  spreadsheetId={spreadsheetId}
                  onRefresh={handleManualRefresh} 
                  onMigrateEquipmentIds={handleBatchMigrateEquipmentIds}
                  isMigratingIds={isMigratingIds}
                />
              )}

              {/* VIEW 2: AREA TELEMETRY PAGE */}
              {activeTab === 'area' && (
                <AreaDashboard 
                  assets={assets} 
                  userArea={user.interestArea} 
                  userEmail={user.email} 
                  isAdmin={user.role === 'Admin' || user.role === 'Manager'}
                  onRefresh={handleManualRefresh}
                />
              )}

              {/* VIEW 3: INPUT DATA ENTRY FORM (Local Operator & Admin only; Manager is restricted) */}
              {activeTab === 'input' && (user.role === 'Admin' || user.role === 'Local Operator' || user.role === 'User') && (
                <InputForm 
                  user={user} 
                  spreadsheetId={spreadsheetId} 
                  googleToken={googleToken} 
                  folderId={folderId} 
                  assets={assets}
                  onSuccess={() => {
                    handleManualRefresh();
                    handleTabChange('area');
                  }} 
                />
              )}

              {/* VIEW 4: ASSET DATABASE & ADVISORY SYSTEM */}
              {activeTab === 'records' && (
                <AssetRecord
                  user={user}
                  googleToken={googleToken}
                  spreadsheetId={spreadsheetId}
                  folderId={folderId}
                  assets={assets}
                  onRefresh={handleManualRefresh}
                  initialEquipmentId={urlEquipmentId}
                />
              )}

              {/* VIEW 5: ADMIN ASSET REGISTRATION & INTEGRITY CHECKS SUITE */}
              {activeTab === 'registration' && (user.role === 'Admin' || user.role === 'Manager') && (
                <AdminRegistrationSuite
                  assets={assets}
                  googleToken={googleToken}
                  spreadsheetId={spreadsheetId}
                  spreadsheetIds={spreadsheetIds}
                  onRefresh={handleManualRefresh}
                  user={user}
                />
              )}

            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-100 py-5 px-6 mt-12">
              <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-[11px] text-gray-400 font-medium">
                <span>&copy; {new Date().getFullYear()} Provincial Electricity Authority (PEA) Thailand. All rights reserved.</span>
                <div className="flex gap-4">
                  <a href="https://www.pea.co.th" target="_blank" rel="noreferrer" className="hover:text-purple-700">PEA Thailand Official Portal</a>
                  <span>&bull;</span>
                  <span>Grid Security Operations Control</span>
                </div>
              </div>
            </footer>

          </div>
        </div>
      )}

      {/* POPUP MODAL FOR ADMIN ACCOUNT ROLE SELECTION (3 ROLES) */}
      {showAdminRoleModal && pendingAdminUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[9000] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-purple-100 shadow-2xl space-y-6 relative">
            <button 
              onClick={() => setShowAdminRoleModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3.5 border-b border-gray-100 pb-4">
              <div className="p-3 bg-purple-100 text-purple-900 rounded-2xl shadow-xs">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[10px] font-mono font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded uppercase tracking-wider">
                  System Admin Privileges
                </span>
                <h3 className="text-base font-black text-gray-900 mt-0.5">Administrator Account Detected</h3>
                <p className="text-xs text-gray-500 font-medium truncate">Logged in as {pendingAdminUser.email}</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-600 font-medium">
                Please select which system role interface you wish to use for this session:
              </p>

              <div className="space-y-2">
                {/* Role 1: Local Operator */}
                <button
                  type="button"
                  onClick={() => setModalRoleChoice('Local Operator')}
                  className={`w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    modalRoleChoice === 'Local Operator' 
                      ? 'border-purple-600 bg-purple-50/80 shadow-xs ring-1 ring-purple-600' 
                      : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                  }`}
                >
                  <div className={`p-2 rounded-xl text-xs font-black ${modalRoleChoice === 'Local Operator' ? 'bg-purple-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    1
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-gray-900">Local Operator</span>
                      <span className="text-[9px] font-mono text-purple-900 bg-purple-100/70 px-1.5 py-0.2 rounded font-bold">Bottom Level</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Field technician view. Access to Area Telemetry, Submit Log, and Asset Records.
                    </p>
                  </div>
                </button>

                {/* Role 2: Manager */}
                <button
                  type="button"
                  onClick={() => setModalRoleChoice('Manager')}
                  className={`w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    modalRoleChoice === 'Manager' 
                      ? 'border-purple-600 bg-purple-50/80 shadow-xs ring-1 ring-purple-600' 
                      : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                  }`}
                >
                  <div className={`p-2 rounded-xl text-xs font-black ${modalRoleChoice === 'Manager' ? 'bg-purple-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    2
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-gray-900">Manager</span>
                      <span className="text-[9px] font-mono text-purple-900 bg-purple-100/70 px-1.5 py-0.2 rounded font-bold">Middle Level (90% Admin)</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Regional manager view. Access to Board Portfolio, Asset Registration, Area Telemetry, and Catalog. <em>(No Submit Log page, disconnect disabled)</em>
                    </p>
                  </div>
                </button>

                {/* Role 3: Admin */}
                <button
                  type="button"
                  onClick={() => setModalRoleChoice('Admin')}
                  className={`w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    modalRoleChoice === 'Admin' 
                      ? 'border-purple-600 bg-purple-50/80 shadow-xs ring-1 ring-purple-600' 
                      : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                  }`}
                >
                  <div className={`p-2 rounded-xl text-xs font-black ${modalRoleChoice === 'Admin' ? 'bg-purple-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    3
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-gray-900">Admin</span>
                      <span className="text-[9px] font-mono text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded font-bold">Top Level (Full Access)</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Full system administration. Access to all 5 panels, Google Sheets disconnect, and national telemetry control.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowAdminRoleModal(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold py-3 px-4 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAdminRoleChoice}
                className="flex-1 bg-purple-900 hover:bg-purple-950 text-white text-xs font-bold py-3 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
              >
                <span>Confirm & Enter System</span>
                <ChevronRight className="w-4 h-4 text-yellow-400" />
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
