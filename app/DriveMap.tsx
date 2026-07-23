"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { DriveData, DrivePoint } from "./page";
import "leaflet/dist/leaflet.css";

export default function DriveMap({ data, selectedTrip, showPlaces }: { data: DriveData | null; selectedTrip: number | null; showPlaces: boolean }) {
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
    const selectedBounds: L.LatLngExpression[] = [];
    for (const [trip, route] of routes) {
      if (route.length < 2) continue;
      const coords = route.map((p) => [p.lat, p.lng] as L.LatLngTuple);
      allBounds.push(...coords.filter((_, i) => i % 20 === 0));
      allBounds.push(coords.at(-1)!);
      if (trip === selectedTrip) selectedBounds.push(...coords);
      const isSelected = trip === selectedTrip;
      const isDimmed = selectedTrip !== null && !isSelected;
      L.polyline(coords, { renderer: canvas, color: "#0d6efd", weight: isSelected ? 9 : 6, opacity: isSelected ? 0.16 : isDimmed ? 0.025 : 0.08, lineCap: "round", lineJoin: "round", interactive: false }).addTo(group);
      L.polyline(coords, { renderer: canvas, color: "#0d6efd", weight: isSelected ? 4 : 2.25, opacity: isSelected ? 0.9 : isDimmed ? 0.09 : 0.35, lineCap: "round", lineJoin: "round", interactive: false }).addTo(group);
      if (isSelected) {
        L.circleMarker(coords[0], { radius: 6, color: "#fff", weight: 2, fillColor: "#198754", fillOpacity: 1 }).bindTooltip("Start").addTo(group);
        L.circleMarker(coords.at(-1)!, { radius: 6, color: "#fff", weight: 2, fillColor: "#dc3545", fillOpacity: 1 }).bindTooltip("Destination").addTo(group);
      }
    }
    if (showPlaces) {
      for (const place of data.places) {
        if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue;
        const tooltip = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = place.name;
        tooltip.append(name);
        if (place.address) {
          const address = document.createElement("div");
          address.textContent = place.address;
          tooltip.append(address);
        }
        L.circleMarker([place.lat, place.lng], { radius: 5, color: "#fff", weight: 2, fillColor: "#6f42c1", fillOpacity: 0.9 })
          .bindTooltip(tooltip)
          .addTo(group);
      }
    }
    const bounds = selectedBounds.length ? selectedBounds : allBounds;
    if (bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [34, 34], maxZoom: selectedBounds.length ? 15 : 12 });
  }, [data, selectedTrip, showPlaces]);

  return <div ref={elementRef} className="leaflet-host" aria-label="Interactive map of recorded drives" />;
}
