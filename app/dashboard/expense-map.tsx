'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Expense, Member } from '../../lib/ledger';
import type { VenueMatch } from '../../lib/venues';
import styles from './expense-map.module.css';

type PinExpense = { id: string; payment: string; title: string; date?: string };
type PinGroup = { key: string; place: VenueMatch; expenses: PinExpense[] };
type MapInstance = { leaflet: typeof import('leaflet'); map: LeafletMap };

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const mapCredit = '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>';
const geocoderCredit = 'Geocoding by <a href="https://www.geoapify.com/">Geoapify</a>';

function groupPins(expenses: Expense[], members: Member[]) {
  const names = new Map(members.map(member => [member.id, member.name]));
  const groups = new Map<string, PinGroup>();
  for (const expense of expenses) {
    const { place } = expense;
    if (!place || (expense.lookup && expense.lookup !== 'matched')) continue;
    const { latitude, longitude } = place;
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) continue;
    if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) continue;

    const key = JSON.stringify([latitude, longitude, place.label]);
    const group = groups.get(key) ?? { key, place, expenses: [] };
    const payer = names.get(expense.payer) ?? 'Unknown member';
    group.expenses.push({
      id: expense.id,
      payment: `${payer} paid ${currency.format(expense.amount / 100)}`,
      title: expense.title,
      date: expense.date,
    });
    groups.set(key, group);
  }
  return [...groups.values()];
}

function popupContent(group: PinGroup) {
  const content = document.createElement('div');
  content.className = styles.popup;
  const location = document.createElement('strong');
  location.textContent = group.place.label;
  content.append(location);

  const list = document.createElement('ul');
  for (const expense of group.expenses) {
    const item = document.createElement('li');
    const payment = document.createElement('strong');
    payment.textContent = expense.payment;
    const detail = document.createElement('div');
    detail.textContent = [expense.title, expense.date].filter(Boolean).join(' · ');
    item.append(payment, detail);
    list.append(item);
  }
  content.append(list);
  return content;
}

function MapWithPins({ groups }: { groups: PinGroup[] }) {
  const mapId = useId();
  const listId = useId();
  const host = useRef<HTMLDivElement>(null);
  const markers = useRef(new Map<string, Marker>());
  const viewport = useRef('');
  const [instance, setInstance] = useState<MapInstance | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);

  useEffect(() => {
    const element = host.current;
    let map: LeafletMap | undefined;
    let observer: ResizeObserver | undefined;
    let cancelled = false;

    import('leaflet').then(leaflet => {
      if (cancelled || !element) return;

      map = leaflet.map(element, { scrollWheelZoom: false });
      map.attributionControl.addAttribution(geocoderCredit);
      const tiles = leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: mapCredit,
        maxZoom: 19,
      });
      let loadedTile = false;
      tiles.on('tileload', () => {
        if (!loadedTile) setTilesUnavailable(false);
        loadedTile = true;
      });
      tiles.on('tileerror', () => {
        if (!loadedTile) setTilesUnavailable(true);
      });
      tiles.addTo(map);

      observer = new ResizeObserver(() => map?.invalidateSize({ pan: false }));
      observer.observe(element);
      viewport.current = '';
      setInstance({ leaflet, map });
    }).catch(() => {
      if (cancelled) return;
      observer?.disconnect();
      map?.remove();
      map = undefined;
      setMapUnavailable(true);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      map?.remove();
    };
  }, []);

  useEffect(() => {
    if (!instance) return;
    const { leaflet, map } = instance;
    const points = groups.map(({ place }): [number, number] => [place.latitude, place.longitude]);
    const positions = JSON.stringify(points.map(point => point.join(',')).sort());
    if (viewport.current !== positions) {
      map.fitBounds(points, { padding: [24, 24], maxZoom: 15, animate: false });
      viewport.current = positions;
    }

    const layer = leaflet.layerGroup().addTo(map);
    const icon = leaflet.divIcon({ className: styles.marker, iconSize: [25, 25], iconAnchor: [12, 12] });
    const currentMarkers = new Map<string, Marker>();
    for (const group of groups) {
      const { latitude, longitude, label } = group.place;
      const marker = leaflet.marker([latitude, longitude], { icon, title: label })
        .addTo(layer)
        .bindPopup(popupContent(group), { maxHeight: 210 });
      marker.getElement()?.setAttribute('aria-label', group.expenses.length === 1
        ? `${group.expenses[0].payment} at ${label}`
        : `${label}, ${group.expenses.length} expenses`);
      currentMarkers.set(group.key, marker);
    }

    markers.current = currentMarkers;
    return () => {
      layer.remove();
      currentMarkers.clear();
    };
  }, [groups, instance]);

  function showPin(key: string) {
    const marker = markers.current.get(key);
    if (!instance || !marker) return;
    instance.map.panTo(marker.getLatLng(), { animate: false });
    marker.openPopup();
    host.current?.scrollIntoView({ block: 'nearest' });
  }

  return (
    <div className={styles.layout}>
      <div className={styles.mapPanel}>
        <div id={mapId} ref={host} className={styles.map} role="region" aria-label="Interactive expense map" />
        {!instance && <p className={styles.status} role="status">
          {mapUnavailable ? 'The interactive map is unavailable. Expense pins are listed below.' : 'Loading map…'}
        </p>}
        {tilesUnavailable && <p className={styles.status} role="status">Map tiles are unavailable. You can still view expense pins.</p>}
        {mapUnavailable && <p className={styles.credits}>
          <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>
          {' · Geocoding by '}<a href="https://www.geoapify.com/">Geoapify</a>
        </p>}
      </div>
      <div className={styles.pinList} role="region" aria-labelledby={listId} tabIndex={0}>
        <h3 id={listId}>Expense pins</h3>
        <ul className={styles.venues}>
          {groups.map(group => (
            <li key={group.key}>
              {instance
                ? <button type="button" aria-label={`Show ${group.place.label} on map`} aria-controls={mapId}
                    onClick={() => showPin(group.key)}>{group.place.label}</button>
                : <strong>{group.place.label}</strong>}
              <ul>
                {group.expenses.map(expense => (
                  <li key={expense.id}>
                    <strong>{expense.payment}</strong>
                    <div className={styles.detail}>
                      {expense.title}{expense.date && <> · <time dateTime={expense.date}>{expense.date}</time></>}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function ExpenseMap({ expenses, members }: { expenses: Expense[]; members: Member[] }) {
  const groups = useMemo(() => groupPins(expenses, members), [expenses, members]);
  if (!groups.length) return <p>No mapped expenses yet. Add a venue to an expense to place it on the map.</p>;
  return <div className={styles.container}><MapWithPins groups={groups} /></div>;
}
