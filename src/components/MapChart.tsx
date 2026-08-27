import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { CableAsset, HealthStatus } from '../types';
import { 
  Flame, 
  Layers, 
  MapPin, 
  Sliders, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  EyeOff,
  Sparkles,
  Info
} from 'lucide-react';

export type HeatmapMode = 'all' | 'critical' | 'warning' | 'healthy';
export type MapViewMode = 'hybrid' | 'heatmap' | 'markers';

interface MapChartProps {
  assets: CableAsset[];
  onSelectAsset?: (asset: CableAsset) => void;
  initialHeatmapEnabled?: boolean;
  initialHeatmapMode?: HeatmapMode;
}

export default function MapChart({ 
  assets, 
  onSelectAsset,
  initialHeatmapEnabled = true,
  initialHeatmapMode = 'all'
}: MapChartProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<any>(null);

  // Heatmap and View Mode States
  const [viewMode, setViewMode] = useState<MapViewMode>('hybrid');
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>(initialHeatmapMode);
  const [showControls, setShowControls] = useState<boolean>(false);
  const [heatRadius, setHeatRadius] = useState<number>(30);
  const [heatBlur, setHeatBlur] = useState<number>(20);
  const [heatOpacity, setHeatOpacity] = useState<number>(0.85);

  // Initialize base Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        preferCanvas: true,
        center: [13.7563, 100.5018],
        zoom: 6,
        zoomControl: false, // We'll add custom top-right zoom control
        scrollWheelZoom: true
      });

      // Add zoom control in top-right to avoid clashing with bottom legend
      L.control.zoom({ position: 'topright' }).addTo(map);

      // 100% Free OpenStreetMap tile layer (No API key required, no watermarks)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      markerGroupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    }

    return () => {
      // Map cleanup on unmount if necessary
    };
  }, []);

  // Update Heatmap and Markers layer when assets or settings change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markerGroup = markerGroupRef.current;
    if (markerGroup) {
      markerGroup.clearLayers();
    }

    // Remove previous heat layer if it exists
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    // Filter valid GPS assets
    const validAssets = assets.filter(asset => {
      if (!asset || !asset.gps) return false;
      const lat = typeof asset.gps.lat === 'number' ? asset.gps.lat : parseFloat(asset.gps.lat as any);
      const lng = typeof asset.gps.lng === 'number' ? asset.gps.lng : parseFloat(asset.gps.lng as any);
      return !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0);
    }).map(asset => ({
      ...asset,
      gps: {
        lat: typeof asset.gps.lat === 'number' ? asset.gps.lat : parseFloat(asset.gps.lat as any),
        lng: typeof asset.gps.lng === 'number' ? asset.gps.lng : parseFloat(asset.gps.lng as any)
      }
    }));

    if (validAssets.length === 0) return;

    const bounds: L.LatLngTuple[] = [];

    // 1. Build and Mount Heatmap Layer if viewMode is 'hybrid' or 'heatmap'
    if (viewMode === 'hybrid' || viewMode === 'heatmap') {
      // Filter assets and assign heat intensity weights based on health status
      let heatDataPoints: [number, number, number][] = [];
      let customGradient: Record<number, string> = {};

      if (heatmapMode === 'critical') {
        // Red (Danger) & Orange (Alert) Hotspots
        const criticalAssets = validAssets.filter(
          a => a.healthStatus === 'Red' || a.healthStatus === 'Orange'
        );
        heatDataPoints = criticalAssets.map(a => [
          a.gps.lat,
          a.gps.lng,
          a.healthStatus === 'Red' ? 1.0 : 0.75
        ]);
        // Fiery red-orange warning gradient
        customGradient = {
          0.1: '#fed7aa', // Light Orange
          0.3: '#fb923c', // Vivid Orange
          0.6: '#ef4444', // Danger Red
          0.9: '#b91c1c', // Deep Crimson Red
          1.0: '#7f1d1d'  // Intense Hazard Dark Red
        };
      } else if (heatmapMode === 'warning') {
        // Yellow & Orange Assets
        const warningAssets = validAssets.filter(
          a => a.healthStatus === 'Yellow' || a.healthStatus === 'Orange'
        );
        heatDataPoints = warningAssets.map(a => [
          a.gps.lat,
          a.gps.lng,
          a.healthStatus === 'Orange' ? 0.9 : 0.6
        ]);
        // Amber-Yellow monitor gradient
        customGradient = {
          0.1: '#fef08a', // Light Yellow
          0.4: '#facc15', // Vibrant Yellow
          0.7: '#f59e0b', // Amber
          1.0: '#d97706'  // Deep Amber
        };
      } else if (heatmapMode === 'healthy') {
        // Green (Normal / Healthy) Assets
        const healthyAssets = validAssets.filter(
          a => a.healthStatus === 'Green' || !a.healthStatus
        );
        heatDataPoints = healthyAssets.map(a => [
          a.gps.lat,
          a.gps.lng,
          0.8
        ]);
        // Emerald Green lush health gradient
        customGradient = {
          0.1: '#bbf7d0', // Light Mint
          0.3: '#4ade80', // Fresh Green
          0.6: '#10b981', // Emerald
          0.9: '#059669', // Deep Emerald
          1.0: '#064e3b'  // Dark Forest Green
        };
      } else {
        // 'all': Comprehensive Health-Risk Weighted Density Heatmap
        // Red = Highest Intensity (1.0), Orange = 0.75, Yellow = 0.5, Green = 0.25
        heatDataPoints = validAssets.map(a => {
          let weight = 0.3;
          if (a.healthStatus === 'Red') weight = 1.0;
          else if (a.healthStatus === 'Orange') weight = 0.75;
          else if (a.healthStatus === 'Yellow') weight = 0.5;
          else if (a.healthStatus === 'Green') weight = 0.25;
          return [a.gps.lat, a.gps.lng, weight];
        });
        // Multi-spectrum health risk gradient (Green -> Amber -> Orange -> Fiery Red)
        customGradient = {
          0.15: '#34d399', // Emerald Green (Healthy)
          0.35: '#60a5fa', // Blue (Transition)
          0.55: '#facc15', // Yellow (Monitor)
          0.75: '#f97316', // Orange (Alert)
          1.0: '#ef4444'   // Crimson Red (Critical Hazard)
        };
      }

      if (heatDataPoints.length > 0 && (L as any).heatLayer) {
        try {
          const heatLayer = (L as any).heatLayer(heatDataPoints, {
            radius: heatRadius,
            blur: heatBlur,
            maxZoom: 16,
            max: 1.0,
            minOpacity: 0.2,
            gradient: customGradient
          });
          heatLayer.addTo(map);
          heatLayerRef.current = heatLayer;
        } catch (e) {
          console.warn('Leaflet heatLayer error:', e);
        }
      }
    }

    // 2. Build and Mount Markers Layer if viewMode is 'hybrid' or 'markers'
    if ((viewMode === 'hybrid' || viewMode === 'markers') && markerGroup) {
      const statusColors: Record<string, string> = {
        Green: '#10B981',  // Emerald Green: Normal
        Yellow: '#EAB308', // Yellow: Monitor
        Orange: '#F97316', // Orange: Alert
        Red: '#EF4444'     // Red: Dangerous
      };

      // Group assets by exact GPS location coordinates (5 decimal precision ~1 meter)
      interface LocationGroup {
        gpsKey: string;
        lat: number;
        lng: number;
        assets: CableAsset[];
        worstHealthStatus: HealthStatus;
        lowestHealthScore: number;
        substationName: string;
        city: string;
      }

      const locationGroupsMap = new Map<string, LocationGroup>();

      validAssets.forEach(asset => {
        const lat = Number(asset.gps.lat.toFixed(5));
        const lng = Number(asset.gps.lng.toFixed(5));
        const key = `${lat},${lng}`;

        if (!locationGroupsMap.has(key)) {
          locationGroupsMap.set(key, {
            gpsKey: key,
            lat,
            lng,
            assets: [],
            worstHealthStatus: 'Green',
            lowestHealthScore: 100,
            substationName: asset.substationName || '',
            city: asset.city || ''
          });
        }

        const group = locationGroupsMap.get(key)!;
        group.assets.push(asset);

        if (!group.substationName && asset.substationName) {
          group.substationName = asset.substationName;
        }
        if (!group.city && asset.city) {
          group.city = asset.city;
        }

        const currentStatus = group.worstHealthStatus;
        const assetStatus = asset.healthStatus || 'Green';
        const severityRank: Record<string, number> = { Red: 4, Orange: 3, Yellow: 2, Green: 1 };
        if ((severityRank[assetStatus] || 1) > (severityRank[currentStatus] || 1)) {
          group.worstHealthStatus = assetStatus;
        }

        if (typeof asset.healthScore === 'number' && asset.healthScore < group.lowestHealthScore) {
          group.lowestHealthScore = asset.healthScore;
        }
      });

      const escapeHtml = (str?: string) => {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      };

      locationGroupsMap.forEach(group => {
        const isMultiple = group.assets.length > 1;
        const color = statusColors[group.worstHealthStatus] || '#10B981';
        const isCritical = group.worstHealthStatus === 'Red';
        const isOrange = group.worstHealthStatus === 'Orange';

        // Marker radius: slightly larger if multiple assets share the coordinate
        const radius = isMultiple 
          ? (isCritical ? 10 : isOrange ? 9 : 8) 
          : (isCritical ? 8 : isOrange ? 7 : 5.5);

        const marker = L.circleMarker([group.lat, group.lng], {
          radius,
          fillColor: color,
          color: isCritical ? '#7f1d1d' : (isMultiple ? '#4c1d95' : '#ffffff'),
          weight: isMultiple ? 2.5 : (isCritical ? 2.5 : 1.5),
          opacity: 1,
          fillOpacity: viewMode === 'hybrid' ? 0.88 : 0.95
        });

        // Tooltip hint on hover
        if (isMultiple) {
          marker.bindTooltip(
            `📍 <b>${escapeHtml(group.substationName || group.city || 'Location')}</b> (${group.assets.length} assets)<br/><span style="font-size:10px; color:#6b7280;">Click or hover to pick asset</span>`,
            { direction: 'top', offset: [0, -8], opacity: 0.95 }
          );
        }

        // Popup Content
        let popupContent = '';

        if (!isMultiple) {
          // Single asset view
          const asset = group.assets[0];
          const currentYear = new Date().getFullYear();
          const regYear = asset.yearOfRegistration || currentYear;
          const age = currentYear - regYear;

          popupContent = `
            <div class="p-3 font-sans text-xs text-gray-800 leading-tight min-w-[230px]">
              <div class="font-bold border-b border-gray-100 pb-1.5 mb-2 text-gray-900 flex items-center justify-between gap-2">
                <span class="truncate font-bold">${escapeHtml(asset.equipmentType || 'Cable Asset')}</span>
                <span class="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                  asset.healthStatus === 'Red' ? 'bg-red-100 text-red-700' :
                  asset.healthStatus === 'Orange' ? 'bg-orange-100 text-orange-700' :
                  asset.healthStatus === 'Yellow' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-emerald-100 text-emerald-700'
                }">${asset.healthStatus || 'Green'}</span>
              </div>
              <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                <span class="text-gray-400 font-medium">Equipment ID:</span>
                <span class="font-mono text-gray-900 font-bold truncate">${escapeHtml(asset.equipmentId || 'N/A')}</span>
                <span class="text-gray-400 font-medium">Manufacturer:</span>
                <span class="text-gray-900 truncate">${escapeHtml(asset.manufacturer || 'N/A')}</span>
                <span class="text-gray-400 font-medium">Voltage Level:</span>
                <span class="text-gray-900 font-bold">${escapeHtml(asset.voltageLevel || '22')} kV</span>
                <span class="text-gray-400 font-medium">Operational Age:</span>
                <span class="text-gray-900">${age} Yrs (${regYear})</span>
                <span class="text-gray-400 font-medium">Health Index:</span>
                <span class="font-bold" style="color: ${
                  asset.healthStatus === 'Red' ? '#EF4444' : 
                  asset.healthStatus === 'Orange' ? '#F97316' : 
                  asset.healthStatus === 'Yellow' ? '#D97706' : '#10B981'
                }">${asset.healthScore ?? 100}%</span>
              </div>
              <div class="mt-2.5 text-[10px] text-gray-500 border-t border-gray-100 pt-2 flex justify-between items-center">
                <span class="truncate max-w-[130px] font-medium">${escapeHtml(asset.city || '')}</span>
                <span class="text-purple-700 hover:text-purple-900 font-bold uppercase tracking-wider cursor-pointer">Open Details &rarr;</span>
              </div>
            </div>
          `;
        } else {
          // Multiple assets at this coordinate
          popupContent = `
            <div class="p-3 font-sans text-xs text-gray-800 leading-tight min-w-[290px] max-w-[340px]">
              <!-- Location Header -->
              <div class="border-b border-gray-100 pb-2 mb-2">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-bold text-gray-900 text-sm truncate">
                    📍 ${escapeHtml(group.substationName || group.city || 'Asset Location')}
                  </span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
                    ${group.assets.length} ASSETS
                  </span>
                </div>
                <div class="text-[10px] text-gray-400 font-mono mt-0.5 flex items-center justify-between">
                  <span>GPS: ${group.lat.toFixed(5)}, ${group.lng.toFixed(5)}</span>
                  <span class="font-semibold text-gray-600 truncate max-w-[120px]">${escapeHtml(group.city || '')}</span>
                </div>
              </div>

              <!-- Asset Selection Header -->
              <div class="text-[11px] font-medium text-gray-500 mb-1.5 flex items-center justify-between">
                <span>Select asset at this location:</span>
                <span class="text-[10px] text-purple-700 font-semibold">Click to open</span>
              </div>

              <!-- Scrollable Asset List -->
              <div class="max-h-[220px] overflow-y-auto space-y-1.5 pr-1" style="scrollbar-width: thin;">
                ${group.assets.map((asset, idx) => `
                  <div 
                    class="asset-select-row p-2 rounded-lg border border-gray-200 hover:border-purple-400 hover:bg-purple-50/70 bg-white transition-all cursor-pointer shadow-2xs flex flex-col gap-1"
                    data-asset-index="${idx}"
                  >
                    <div class="flex items-center justify-between gap-1">
                      <span class="font-mono font-bold text-gray-900 text-[11px] truncate">
                        ${escapeHtml(asset.equipmentId || asset.peaNumber || 'Asset #' + (idx + 1))}
                      </span>
                      <span class="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                        asset.healthStatus === 'Red' ? 'bg-red-100 text-red-700' :
                        asset.healthStatus === 'Orange' ? 'bg-orange-100 text-orange-700' :
                        asset.healthStatus === 'Yellow' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-emerald-100 text-emerald-700'
                      }">
                        ${asset.healthStatus || 'Green'} (${asset.healthScore ?? 100}%)
                      </span>
                    </div>
                    <div class="flex items-center justify-between text-[10px] text-gray-500">
                      <span class="truncate max-w-[170px]">${escapeHtml(asset.equipmentType || 'Cable')} • ${escapeHtml(asset.voltageLevel || '22')} kV</span>
                      <span class="text-purple-700 font-bold hover:underline">Select &rarr;</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }

        marker.bindPopup(popupContent, {
          closeButton: false,
          minWidth: isMultiple ? 290 : 230,
          className: 'custom-leaflet-popup cursor-pointer'
        });

        // Open popup on hover
        marker.on('mouseover', function () {
          this.openPopup();
        });

        // Click marker logic
        marker.on('click', () => {
          if (!isMultiple && onSelectAsset) {
            onSelectAsset(group.assets[0]);
          } else {
            marker.openPopup();
          }
        });

        // Popup interactive selection
        marker.on('popupopen', () => {
          const popupEl = marker.getPopup()?.getElement();
          if (!popupEl) return;

          if (!isMultiple) {
            popupEl.onclick = () => {
              if (onSelectAsset) {
                onSelectAsset(group.assets[0]);
              }
            };
          } else {
            const rows = popupEl.querySelectorAll('.asset-select-row');
            rows.forEach(row => {
              const idxStr = row.getAttribute('data-asset-index');
              const idx = idxStr !== null ? parseInt(idxStr, 10) : -1;
              const targetAsset = group.assets[idx];
              if (targetAsset) {
                (row as HTMLElement).onclick = (e) => {
                  e.stopPropagation();
                  if (onSelectAsset) {
                    onSelectAsset(targetAsset);
                  }
                };
              }
            });
          }
        });

        markerGroup.addLayer(marker);
        bounds.push([group.lat, group.lng]);
      });
    } else {
      validAssets.forEach(a => {
        bounds.push([a.gps.lat, a.gps.lng]);
      });
    }

    // Fit map bounds to encompass visible assets
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
    }
  }, [assets, viewMode, heatmapMode, heatRadius, heatBlur, heatOpacity, onSelectAsset]);

  // Statistics calculation for the badge
  const validGpsAssets = assets.filter(a => {
    if (!a || !a.gps) return false;
    const lat = typeof a.gps.lat === 'number' ? a.gps.lat : parseFloat(a.gps.lat as any);
    const lng = typeof a.gps.lng === 'number' ? a.gps.lng : parseFloat(a.gps.lng as any);
    return !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0);
  });
  const validGpsCount = validGpsAssets.length;
  const uniqueCoordinatesCount = new Set(
    validGpsAssets.map(a => {
      const lat = typeof a.gps.lat === 'number' ? a.gps.lat : parseFloat(a.gps.lat as any);
      const lng = typeof a.gps.lng === 'number' ? a.gps.lng : parseFloat(a.gps.lng as any);
      return `${lat.toFixed(5)},${lng.toFixed(5)}`;
    })
  ).size;

  const criticalCount = assets.filter(a => a.healthStatus === 'Red' || a.healthStatus === 'Orange').length;
  const healthyCount = assets.filter(a => a.healthStatus === 'Green' || !a.healthStatus).length;
  const warningCount = assets.filter(a => a.healthStatus === 'Yellow').length;

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-gray-200/80 shadow-xs bg-slate-50 flex flex-col">
      {/* Top Map Interactive Controls Bar */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-wrap items-center gap-2 max-w-[calc(100%-80px)]">
        {/* View Mode Pill Switcher */}
        <div className="bg-white/95 backdrop-blur-md px-1.5 py-1 rounded-xl shadow-md border border-gray-200/90 flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('hybrid')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'hybrid'
                ? 'bg-purple-900 text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
            title="Show both heatmap density overlay and individual asset pins"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Hybrid</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('heatmap')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'heatmap'
                ? 'bg-purple-900 text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
            title="Show density heatmap only without pin clutter"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Heatmap Only</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('markers')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'markers'
                ? 'bg-purple-900 text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
            title="Show standard pin markers only"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Markers Only</span>
          </button>
        </div>

        {/* Heatmap Health Filter Mode (Visible when heatmap is active) */}
        {viewMode !== 'markers' && (
          <div className="bg-white/95 backdrop-blur-md px-1.5 py-1 rounded-xl shadow-md border border-gray-200/90 flex items-center gap-1 text-xs animate-fadeIn">
            <span className="text-[10px] font-bold text-gray-400 uppercase px-1.5 flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-500" />
              Density:
            </span>

            <button
              type="button"
              onClick={() => setHeatmapMode('all')}
              className={`px-2 py-0.5 rounded-md font-bold text-[11px] transition-all cursor-pointer ${
                heatmapMode === 'all'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
              title="Overall health-risk density: Red & Orange highlighted with highest glow intensity"
            >
              All (Risk Weighted)
            </button>

            <button
              type="button"
              onClick={() => setHeatmapMode('critical')}
              className={`px-2 py-0.5 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                heatmapMode === 'critical'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-red-700 hover:bg-red-50'
              }`}
              title="Highlight critical condition (Red & Orange) emergency hazard clusters"
            >
              <ShieldAlert className="w-3 h-3" />
              <span>Critical ({criticalCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setHeatmapMode('warning')}
              className={`px-2 py-0.5 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                heatmapMode === 'warning'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-amber-700 hover:bg-amber-50'
              }`}
              title="Highlight warning / monitor condition (Yellow & Orange) clusters"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Warning ({warningCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setHeatmapMode('healthy')}
              className={`px-2 py-0.5 rounded-md font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer ${
                heatmapMode === 'healthy'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
              title="Highlight healthy condition (Green) equipment distribution"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Healthy ({healthyCount})</span>
            </button>

            {/* Slider Settings Button */}
            <button
              type="button"
              onClick={() => setShowControls(!showControls)}
              className={`p-1 rounded-md transition-all cursor-pointer ${
                showControls
                  ? 'bg-purple-100 text-purple-800'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
              }`}
              title="Tune Heatmap Radius & Blur"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Heatmap Parameter Tuning Floating Dropdown */}
      {showControls && viewMode !== 'markers' && (
        <div className="absolute top-16 left-3 z-[1000] bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-gray-200 w-72 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5 uppercase">
              <Sliders className="w-3.5 h-3.5 text-purple-700" />
              Heatmap Intensity Tuning
            </span>
            <button
              type="button"
              onClick={() => setShowControls(false)}
              className="text-gray-400 hover:text-gray-600 text-xs font-bold px-1"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-600 font-medium">Dispersion Radius:</span>
                <span className="font-mono font-bold text-purple-700">{heatRadius}px</span>
              </div>
              <input
                type="range"
                min="15"
                max="55"
                step="5"
                value={heatRadius}
                onChange={e => setHeatRadius(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-700"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-600 font-medium">Blur Smoothness:</span>
                <span className="font-mono font-bold text-purple-700">{heatBlur}px</span>
              </div>
              <input
                type="range"
                min="10"
                max="40"
                step="5"
                value={heatBlur}
                onChange={e => setHeatBlur(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-700"
              />
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
              <span className="text-[11px] text-gray-500">Preset:</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => { setHeatRadius(20); setHeatBlur(15); }}
                  className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-[10px] font-bold text-gray-700"
                >
                  Sharp Focus
                </button>
                <button
                  type="button"
                  onClick={() => { setHeatRadius(30); setHeatBlur(20); }}
                  className="px-2 py-0.5 rounded bg-purple-100 hover:bg-purple-200 text-[10px] font-bold text-purple-800"
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => { setHeatRadius(45); setHeatBlur(30); }}
                  className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-[10px] font-bold text-gray-700"
                >
                  Wide Glow
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Map Container */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[480px] z-1" />

      {/* Bottom Floating Legend & Health Status Density Bar */}
      <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-gray-200/90 z-[1000] text-[11px] space-y-2 max-w-sm">
        <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
          <span className="font-bold text-gray-900 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            {viewMode === 'markers' ? 'Marker Health Legend' : (
              heatmapMode === 'critical' ? 'Critical Hazard Density' :
              heatmapMode === 'warning' ? 'Monitoring Density' :
              heatmapMode === 'healthy' ? 'Healthy Assets Density' :
              'Health-Risk Density Heatmap'
            )}
          </span>
          <span className="text-[10px] text-gray-500 font-mono">
            {validGpsCount} Assets ({uniqueCoordinatesCount} Locations)
          </span>
        </div>

        {/* Heatmap Density Spectrum Bar (shown when heatmap is enabled) */}
        {viewMode !== 'markers' && (
          <div className="space-y-1 pt-0.5">
            <div className="flex justify-between items-center text-[10px] font-semibold text-gray-500">
              <span>Low Density</span>
              <span>Moderate</span>
              <span className="font-bold text-gray-800">High Density Hotspot</span>
            </div>
            {/* Dynamic CSS Gradient Bar matching active mode */}
            <div 
              className="w-full h-2.5 rounded-full border border-gray-200 shadow-2xs"
              style={{
                background: heatmapMode === 'critical'
                  ? 'linear-gradient(to right, #fed7aa, #fb923c, #ef4444, #991b1b)'
                  : heatmapMode === 'warning'
                  ? 'linear-gradient(to right, #fef08a, #facc15, #f59e0b, #d97706)'
                  : heatmapMode === 'healthy'
                  ? 'linear-gradient(to right, #bbf7d0, #4ade80, #10b981, #064e3b)'
                  : 'linear-gradient(to right, #34d399 15%, #60a5fa 35%, #facc15 55%, #f97316 75%, #ef4444 100%)'
              }}
            />
          </div>
        )}

        {/* Individual Status Markers Legend (shown in Hybrid or Markers mode) */}
        {viewMode !== 'heatmap' && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] pt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 border border-red-800" />
              <span className="text-gray-700 font-medium">Red: Critical ({criticalCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
              <span className="text-gray-700 font-medium">Orange: Alert</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
              <span className="text-gray-700 font-medium">Yellow: Monitor ({warningCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-gray-700 font-medium">Green: Healthy ({healthyCount})</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

