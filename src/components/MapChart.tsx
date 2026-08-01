import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CableAsset } from '../types';

interface MapChartProps {
  assets: CableAsset[];
  onSelectAsset?: (asset: CableAsset) => void;
}

export default function MapChart({ assets, onSelectAsset }: MapChartProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize map if not yet initialized
    if (!mapRef.current) {
      // Centered on Thailand coordinates (e.g. Bangkok / Central Thailand)
      mapRef.current = L.map(mapContainerRef.current, {
        preferCanvas: true,
        center: [13.7563, 100.5018],
        zoom: 6,
        zoomControl: true,
        scrollWheelZoom: true
      });

      // Add a clean, light-themed, free OpenStreetMap layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(mapRef.current);

      layerGroupRef.current = L.layerGroup().addTo(mapRef.current);
    }

    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;

    if (layerGroup) {
      layerGroup.clearLayers();
    }

    // Filter out assets with valid GPS coordinates
    const validAssets = assets.filter(
      asset => asset.gps && typeof asset.gps.lat === 'number' && typeof asset.gps.lng === 'number'
    );

    if (validAssets.length > 0 && map && layerGroup) {
      const bounds: L.LatLngTuple[] = [];

      const statusColors: Record<string, string> = {
        Green: '#10B981',  // Emerald Green: Normal
        Yellow: '#EAB308', // Yellow: Monitor
        Orange: '#F97316', // Orange: Alert
        Red: '#EF4444'     // Red: Dangerous
      };

      validAssets.forEach(asset => {
        const color = statusColors[asset.healthStatus] || '#10B981';
        const marker = L.circleMarker([asset.gps.lat, asset.gps.lng], {
          radius: asset.healthStatus === 'Red' ? 8 : 6,
          fillColor: color,
          color: asset.healthStatus === 'Red' ? '#b91c1c' : '#ffffff',
          weight: asset.healthStatus === 'Red' ? 2 : 1.5,
          opacity: 1,
          fillOpacity: 0.9
        });

        // Hover tooltip popup
        const currentYear = new Date().getFullYear();
        const age = currentYear - asset.yearOfRegistration;
        
        const popupContent = `
          <div class="p-1 font-sans text-xs text-gray-800 leading-tight">
            <div class="font-bold border-b border-gray-100 pb-1 mb-1 text-gray-900">${asset.equipmentType}</div>
            <div class="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1">
              <span class="text-gray-400 font-medium">ID:</span>
              <span class="font-mono text-gray-900">${asset.equipmentId}</span>
              <span class="text-gray-400 font-medium">Brand:</span>
              <span class="text-gray-900">${asset.manufacturer}</span>
              <span class="text-gray-400 font-medium">Voltage:</span>
              <span class="text-gray-900">${asset.voltageLevel} kV</span>
              <span class="text-gray-400 font-medium">Age:</span>
              <span class="text-gray-900">${age} Years (${asset.yearOfRegistration})</span>
              <span class="text-gray-400 font-medium">Health Status:</span>
              <span class="font-semibold" style="color: ${
                asset.healthStatus === 'Red' ? '#EF4444' : 
                asset.healthStatus === 'Orange' ? '#F97316' : 
                asset.healthStatus === 'Yellow' ? '#D97706' : '#10B981'
              }">${asset.healthStatus} (${asset.healthScore}%)</span>
            </div>
            <div class="mt-2 text-[10px] text-gray-400 border-t border-gray-50 pt-1 flex justify-between items-center">
              <span>${asset.city} (${asset.locationType})</span>
              <span class="text-purple-600 hover:underline cursor-pointer font-semibold uppercase">View details &rarr;</span>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent, {
          closeButton: false,
          minWidth: 200,
          className: 'custom-leaflet-popup'
        });

        // Open popup on hover
        marker.on('mouseover', function (e) {
          this.openPopup();
        });

        // Click handler to select asset
        marker.on('click', () => {
          if (onSelectAsset) {
            onSelectAsset(asset);
          }
        });

        layerGroup.addLayer(marker);
        bounds.push([asset.gps.lat, asset.gps.lng]);
      });

      // Fit map bounds to encompass all visible assets with padding
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
    }

    // Force style injecting for marker keyframe animation
    const styleId = 'leaflet-custom-marker-animations';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        @keyframes ping {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; }
        }
        .custom-leaflet-popup .leaflet-popup-content-wrapper {
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          border: 1px solid #E5E7EB;
        }
        .custom-leaflet-popup .leaflet-popup-tip {
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          border: 1px solid #E5E7EB;
        }
      `;
      document.head.appendChild(style);
    }
  }, [assets]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-gray-100 shadow-xs">
      <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: '400px', zIndex: 1 }} />
      <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur-xs p-2 rounded-lg shadow-sm border border-gray-100 z-[1000] text-[10px] space-y-1">
        <div className="font-semibold text-gray-700 border-b border-gray-100 pb-1 mb-1 uppercase tracking-wider">Health Status Legend</div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-gray-600 font-medium">Red: Dangerous (Immediate Attention)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
          <span className="text-gray-600 font-medium">Orange: Alert (Degradation improvement)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <span className="text-gray-600 font-medium">Yellow: Monitor (Intensive tracking)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-gray-600 font-medium">Green: Normal (Routine routine plan)</span>
        </div>
      </div>
    </div>
  );
}
