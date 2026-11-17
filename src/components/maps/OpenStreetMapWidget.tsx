import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface OpenStreetMapWidgetProps {
  coordinates: [number, number][]; // [lat, lng]
  centerFallback?: [number, number];
  heightClassName?: string;
  roundedClassName?: string;
  interactive?: boolean;
  onPickLocation?: (lat: number, lng: number) => void;
  polygonColor?: string;
  landmarkLabel?: string;
  fitPadding?: number;
  maxFitZoom?: number;
}

export const OpenStreetMapWidget: React.FC<OpenStreetMapWidgetProps> = ({
  coordinates,
  centerFallback = [9.0765, 7.3986],
  heightClassName = 'h-64',
  roundedClassName = 'rounded-xl border border-slate-700',
  interactive = true,
  onPickLocation,
  polygonColor = '#10b981',
  landmarkLabel,
  fitPadding = 44,
  maxFitZoom = 16
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPickLocation);

  useEffect(() => {
    onPickRef.current = onPickLocation;
  }, [onPickLocation]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: [number, number] =
      coordinates.length > 0 ? coordinates[0] : centerFallback;

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: maxFitZoom,
      zoomControl: interactive,
      attributionControl: true,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      touchZoom: interactive
    });

    L.tileLayer('/api/osm-tile/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    const group = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onPickRef.current) {
        onPickRef.current(e.latlng.lat, e.latlng.lng);
      }
    });

    mapRef.current = map;
    layerGroupRef.current = group;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (coordinates.length >= 3) {
      const polygon = L.polygon(coordinates, {
        color: '#047857',
        weight: 3,
        fillColor: polygonColor,
        fillOpacity: 0.34
      }).addTo(group);

      coordinates.forEach(([lat, lng], idx) => {
        L.circleMarker([lat, lng], {
          radius: 4.5,
          color: '#ffffff',
          weight: 2,
          fillColor: polygonColor,
          fillOpacity: 1
        })
          .bindTooltip(`PB ${idx + 1}: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, {
            direction: 'top',
            offset: [0, -6]
          })
          .addTo(group);
      });

      const bounds = polygon.getBounds();
      if (bounds.isValid()) {
        const center = bounds.getCenter();
        const pinMarker = L.circleMarker(center, {
          radius: 6,
          color: '#ffffff',
          weight: 2.5,
          fillColor: '#f59e0b',
          fillOpacity: 1
        }).addTo(group);
        if (landmarkLabel) {
          pinMarker.bindTooltip(landmarkLabel, {
            permanent: true,
            direction: 'top',
            offset: [0, -8]
          });
        }
        map.fitBounds(bounds, {
          padding: [fitPadding, fitPadding],
          maxZoom: maxFitZoom,
          animate: false
        });
      }
    } else if (coordinates.length > 0) {
      const [lat, lng] = coordinates[0];
      L.circleMarker([lat, lng], {
        radius: 7,
        color: '#ffffff',
        weight: 2.5,
        fillColor: polygonColor,
        fillOpacity: 1
      }).addTo(group);
      map.setView([lat, lng], maxFitZoom);
    } else if (centerFallback) {
      map.setView(centerFallback, 14);
    }
  }, [coordinates, centerFallback, polygonColor, landmarkLabel, fitPadding, maxFitZoom]);

  return (
    <div
      ref={containerRef}
      className={`w-full ${heightClassName} ${roundedClassName} overflow-hidden bg-slate-900 z-0`}
      style={{ cursor: onPickLocation ? 'crosshair' : undefined }}
    />
  );
};
