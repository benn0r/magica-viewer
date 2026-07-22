"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { DriveData, DrivePoint } from "./page";
import "leaflet/dist/leaflet.css";

export default function DriveMap({ data }: { data: DriveData | null }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return;
    const map = L.map(elementRef.current, { zoomControl: false, minZoom: 2, worldCopyJump: true, attributionControl: true }).setView([25, 8], 2);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 50);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layerRef.current?.remove();
    if (!data?.points.length) return;
    const group = L.layerGroup().addTo(map);
    layerRef.current = group;
    const canvas = L.canvas({ padding: 0.5, tolerance: 8 });
    const routes = new Map<number, DrivePoint[]>();
    for (const point of data.points) {
      const route = routes.get(point.trip) ?? [];
      route.push(point);
      routes.set(point.trip, route);
    }
    const allBounds: L.LatLngExpression[] = [];
    for (const route of routes.values()) {
      if (route.length < 2) continue;
      const coords = route.map((p) => [p.lat, p.lng] as L.LatLngTuple);
      allBounds.push(...coords.filter((_, i) => i % 20 === 0));
      L.polyline(coords, { renderer: canvas, color: "#0d6efd", weight: 6, opacity: 0.08, lineCap: "round", lineJoin: "round", interactive: false }).addTo(group);
      L.polyline(coords, { renderer: canvas, color: "#0d6efd", weight: 2.25, opacity: 0.35, lineCap: "round", lineJoin: "round", interactive: false }).addTo(group);
    }
    if (allBounds.length) map.fitBounds(L.latLngBounds(allBounds), { padding: [34, 34], maxZoom: 12 });
  }, [data]);

  return <div ref={elementRef} className="leaflet-host" aria-label="Interactive map of recorded drives" />;
}
