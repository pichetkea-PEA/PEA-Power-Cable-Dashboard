import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { CableAsset } from '../types';
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

      // Clean, light-themed Voyager tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
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
    const validAssets = assets.filter(
      asset => asset.gps && typeof asset.gps.lat === 'number' && typeof asset.gps.lng === 'number'
    );

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

      // Filter markers based on current heatmap filter if in filtered mode, or display all
      const visibleMarkerAssets = validAssets;

      visibleMarkerAssets.forEach(asset => {
        const color = statusColors[asset.healthStatus] || '#10B981';
        const isCritical = asset.healthStatus === 'Red';
        const isOrange = asset.healthStatus === 'Orange';

        const marker = L.circleMarker([asset.gps.lat, asset.gps.lng], {
          radius: isCritical ? 8 : isOrange ? 7 : 5.5,
          fillColor: color,
          color: isCritical ? '#7f1d1d' : '#ffffff',
          weight: isCritical ? 2.5 : 1.5,
          opacity: 1,
          fillOpacity: viewMode === 'hybrid' ? 0.85 : 0.95
        });

        // Hover tooltip popup
        const currentYear = new Date().getFullYear();
        const regYear = asset.yearOfRegistration || currentYear;
        const age = currentYear - regYear;
        
        const popupContent = `
          <div class="p-1 font-sans text-xs text-gray-800 leading-tight">
            <div class="font-bold border-b border-gray-100 pb-1 mb-1 text-gray-900 flex items-center justify-between gap-2">
              <span>${asset.equipmentType || 'Asset'}</span>
              <span class="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                asset.healthStatus === 'Red' ? 'bg-red-100 text-red-700' :
                asset.healthStatus === 'Orange' ? 'bg-orange-100 text-orange-700' :
                asset.healthStatus === 'Yellow' ? 'bg-yellow-100 text-yellow-800' :
                'bg-emerald-100 text-emerald-700'
              }">${asset.healthStatus || 'Green'}</span>
            </div>
            <div class="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1 text-[11px]">
              <span class="text-gray-400 font-medium">Equipment ID:</span>
              <span class="font-mono text-gray-900 font-bold truncate">${asset.equipmentId || 'N/A'}</span>
              <span class="text-gray-400 font-medium">Manufacturer:</span>
              <span class="text-gray-900 truncate">${asset.manufacturer || 'N/A'}</span>
              <span class="text-gray-400 font-medium">Voltage Level:</span>
              <span class="text-gray-900 font-bold">${asset.voltageLevel || '22'} kV</span>
              <span class="text-gray-400 font-medium">Operational Age:</span>
              <span class="text-gray-900">${age} Yrs (${regYear})</span>
              <span class="text-gray-400 font-medium">Health Index:</span>
              <span class="font-bold" style="color: ${
                asset.healthStatus === 'Red' ? '#EF4444' : 
                asset.healthStatus === 'Orange' ? '#F97316' : 
                asset.healthStatus === 'Yellow' ? '#D97706' : '#10B981'
              }">${asset.healthScore ?? 100}%</span>
            </div>
            <div class="mt-2 text-[10px] text-gray-500 border-t border-gray-100 pt-1.5 flex justify-between items-center">
              <span class="truncate max-w-[130px]">${asset.city || ''} (${asset.locationType || ''})</span>
              <span class="text-purple-700 hover:text-purple-900 font-bold uppercase tracking-wider cursor-pointer">Open Details &rarr;</span>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent, {
          closeButton: false,
          minWidth: 210,
          className: 'custom-leaflet-popup cursor-pointer'
        });

        // Open popup on hover
        marker.on('mouseover', function () {
          this.openPopup();
        });

        // Click handler to select asset
        marker.on('click', () => {
          if (onSelectAsset) {
            onSelectAsset(asset);
          }
        });

        // Popup click selection
        marker.on('popupopen', () => {
          const popupEl = marker.getPopup()?.getElement();
          if (popupEl) {
            popupEl.onclick = () => {
              if (onSelectAsset) {
                onSelectAsset(asset);
              }
            };
          }
        });

        markerGroup.addLayer(marker);
        bounds.push([asset.gps.lat, asset.gps.lng]);
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
  const validGpsCount = assets.filter(a => a.gps && typeof a.gps.lat === 'number').length;
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
            {validGpsCount} GPS Assets
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

