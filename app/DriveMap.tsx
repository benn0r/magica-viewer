"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { DriveData, DrivePoint } from "./page";
import "leaflet/dist/leaflet.css";

function distanceKm(a: DrivePoint, b: DrivePoint) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function splitRoute(route: DrivePoint[]) {
  const segments: DrivePoint[][] = [];
  let segment: DrivePoint[] = [];

  for (const point of route) {
    const previous = segment.at(-1);
    if (previous) {
      const gapMs = point.t - previous.t;
      const gapHours = gapMs / (60 * 60 * 1000);
      const jumpKm = distanceKm(previous, point);
      const implausibleJump = jumpKm > 1.5 || jumpKm > Math.max(0.3, gapHours * 150);
      if (gapMs <= 0 || gapMs > 3 * 60 * 1000 || implausibleJump) {
        if (segment.length > 1) segments.push(segment);
        segment = [];
      }
    }
    segment.push(point);
  }

  if (segment.length > 1) segments.push(segment);
  return segments;
}

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
      for (const segment of splitRoute(route)) {
        const coords = segment.map((p) => [p.lat, p.lng] as L.LatLngTuple);
        allBounds.push(...coords.filter((_, i) => i % 20 === 0));
        L.polyline(coords, { renderer: canvas, color: "#0d6efd", weight: 6, opacity: 0.08, lineCap: "round", lineJoin: "round", interactive: false }).addTo(group);
        L.polyline(coords, { renderer: canvas, color: "#0d6efd", weight: 2.25, opacity: 0.35, lineCap: "round", lineJoin: "round", interactive: false }).addTo(group);
      }
    }
    if (allBounds.length) map.fitBounds(L.latLngBounds(allBounds), { padding: [34, 34], maxZoom: 12 });
  }, [data]);

  return <div ref={elementRef} className="leaflet-host" aria-label="Interactive map of recorded drives" />;
}
