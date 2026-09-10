import { useState, useEffect } from 'react';
import { getReferenceData } from '../services/referenceData.js';

// Module-level cache so the same type is only fetched once per page load
const cache = {};
const listeners = {};

function notify(type) {
  (listeners[type] || []).forEach(fn => fn(cache[type]));
}

// Pass a refreshKey to force a re-fetch after cache invalidation (e.g. after admin mutations)
export function useReferenceData(type, refreshKey = 0) {
  const [data, setData]     = useState(cache[type] || []);
  const [loading, setLoading] = useState(!cache[type]);

  useEffect(() => {
    if (!type) return;

    // Already cached
    if (cache[type]) { setData(cache[type]); setLoading(false); return; }

    setLoading(true);

    // Subscribe to updates for this type
    if (!listeners[type]) listeners[type] = [];
    const handler = (d) => { setData(d); setLoading(false); };
    listeners[type].push(handler);

    // Only one fetch per type — other subscribers wait
    if (listeners[type].length === 1) {
      getReferenceData(type)
        .then(rows => { cache[type] = rows; notify(type); })
        .catch(() => { cache[type] = []; notify(type); });
    }

    return () => {
      listeners[type] = (listeners[type] || []).filter(fn => fn !== handler);
    };
  }, [type, refreshKey]);

  return { data, loading };
}

// Invalidate cache for a type (call after admin creates/updates/deletes)
export function invalidateReferenceData(type) {
  delete cache[type];
}

// Helper: build grouped options for a <select> from PRODUCTION_FUNCTION data
export function buildFunctionGroups(items) {
  const groups = {};
  items.forEach(item => {
    const g = item.group || 'Other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(item);
  });
  return Object.entries(groups).map(([label, options]) => ({ label, options }));
}

// Helper: build subgroup map { subgroupName: [categoryCode, ...] } from WASTE_CATEGORY data
export function buildSubgroups(items, source, wasteType) {
  const filtered = items.filter(i =>
    i.metadata?.waste_type === wasteType &&
    (i.metadata?.source === source || i.metadata?.source === 'BOTH')
  );
  const groups = {};
  filtered.forEach(i => {
    const g = i.group || 'General';
    if (!groups[g]) groups[g] = [];
    groups[g].push(i.code);
  });
  return groups;
}

// Helper: build nested subgroup map { groupName: { nestedName: [code,...] } }
export function buildNestedSubgroups(items, source, wasteType) {
  const filtered = items.filter(i =>
    i.metadata?.waste_type === wasteType &&
    (i.metadata?.source === source || i.metadata?.source === 'BOTH') &&
    i.metadata?.nested_subgroup
  );
  if (!filtered.length) return null;
  const result = {};
  filtered.forEach(i => {
    const g = i.group;
    const n = i.metadata.nested_subgroup;
    if (!result[g]) result[g] = {};
    if (!result[g][n]) result[g][n] = [];
    result[g][n].push(i.code);
  });
  return result;
}

// Helper: flat ordered list of category codes for a given source+wasteType
export function categoryCodesFor(items, source, wasteType) {
  return items
    .filter(i =>
      i.metadata?.waste_type === wasteType &&
      (i.metadata?.source === source || i.metadata?.source === 'BOTH')
    )
    .map(i => i.code);
}
