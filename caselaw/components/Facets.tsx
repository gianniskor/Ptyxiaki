import React, { useState } from 'react';
import { Surface } from '@heroui/react';
import { ChevronDown, Check } from 'lucide-react';
import { BsTags } from 'react-icons/bs';
import { truncateAtDots } from '@/lib/api';
import type { FacetItem } from '@/lib/types';

/** A single selectable facet row with a checkbox, label and live count. */
export function FacetRow({
  value, label, count, checked, onToggle, indent = false,
}: {
  value: string; label: string; count: number; checked: boolean;
  onToggle: (value: string) => void; indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(value)}
      title={label}
      className={`flex items-center justify-between w-full gap-2 ${indent ? 'pl-2' : ''} px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-white/5 ${checked ? 'bg-yellow-500/10' : ''}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="w-4 h-4 flex items-center justify-center shrink-0">
          {checked && <Check className="w-4 h-4 text-yellow-500" strokeWidth={3} />}
        </span>
        <span className={`truncate text-sm ${checked ? 'text-yellow-300' : 'text-gray-300'}`}>{label}</span>
      </span>
      <span className="shrink-0 text-xs text-gray-500 tabular-nums">{count}</span>
    </button>
  );
}

/** A collapsible facet section with multi-select rows and a "see more" toggle. */
export function FacetSection({
  title, icon, items, selectedValues, onToggle,
  displayTransform = (v: string) => v, initialVisible = 6, defaultOpen = true,
}: {
  title: string; icon: React.ReactNode; items: FacetItem[];
  selectedValues: string[]; onToggle: (value: string) => void;
  displayTransform?: (v: string) => string; initialVisible?: number; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) return null;
  const visible = showAll ? items : items.slice(0, initialVisible);
  return (
    <Surface className="rounded-2xl p-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full px-1 py-1 text-base font-bold text-gray-200"
      >
        <span className="flex items-center gap-2">{icon}{title}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1">
          <div className="space-y-0.5">
            {visible.map(item => (
              <FacetRow
                key={item.value}
                value={item.value}
                label={displayTransform(item.value)}
                count={item.count}
                checked={selectedValues.includes(item.value)}
                onToggle={onToggle}
              />
            ))}
          </div>
          {items.length > initialVisible && (
            <button
              type="button"
              onClick={() => setShowAll(s => !s)}
              className="mt-1.5 px-2 text-xs font-medium text-yellow-500 hover:text-yellow-400"
            >
              {showAll ? 'Δείτε λιγότερα' : `Δείτε περισσότερα (${items.length - initialVisible})`}
            </button>
          )}
        </div>
      )}
    </Surface>
  );
}

/** One category as a collapsible drop-down containing its subcategory rows. */
export function SubcategoryGroup({
  cat, subs, selectedValues, onToggle,
}: {
  cat: string; subs: FacetItem[]; selectedValues: string[]; onToggle: (value: string) => void;
}) {
  const selectedCount = subs.filter(s => selectedValues.includes(s.value)).length;
  const [open, setOpen] = useState(selectedCount > 0);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-white/5"
      >
        <span className="flex items-center gap-2 min-w-0 ">
          <ChevronDown className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : '-rotate-90'}`} />
          <span className="truncate text-sm text-gray-200">{truncateAtDots(cat)}</span>
        </span>
        {selectedCount > 0 && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">{selectedCount}</span>
        )}
      </button>
      {open && (
        <div className="pl-4 space-y-0.5 pb-1">
          {subs.map(sub => (
            <FacetRow
              key={sub.value}
              value={sub.value}
              label={truncateAtDots(sub.value)}
              count={sub.count}
              checked={selectedValues.includes(sub.value)}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Subcategories section: collapsible category headers + "see more" for the headers. */
export function SubcategorySection({
  groups, selectedValues, onToggle, initialVisible = 6,
}: {
  groups: { cat: string; subs: FacetItem[] }[];
  selectedValues: string[]; onToggle: (value: string) => void; initialVisible?: number;
}) {
  const [open, setOpen] = useState(true);
  const [showAllGroups, setShowAllGroups] = useState(false);
  if (groups.length === 0) return null;
  const visibleGroups = showAllGroups ? groups : groups.slice(0, initialVisible);
  return (
    <Surface className="rounded-2xl p-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full px-1 py-1 text-base font-bold text-gray-200"
      >
        <span className="flex items-center gap-2">
          <BsTags className="w-4 h-4 text-yellow-500/70" /> Υποκατηγορίες
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="mt-1 space-y-0.5">
            {visibleGroups.map(({ cat, subs }) => (
              <SubcategoryGroup
                key={cat}
                cat={cat}
                subs={subs}
                selectedValues={selectedValues}
                onToggle={onToggle}
              />
            ))}
          </div>
          {groups.length > initialVisible && (
            <button
              type="button"
              onClick={() => setShowAllGroups(s => !s)}
              className="mt-1.5 px-2 text-xs font-medium text-yellow-500 hover:text-yellow-400"
            >
              {showAllGroups ? 'Δείτε λιγότερες κατηγορίες' : `Δείτε περισσότερες κατηγορίες (${groups.length - initialVisible})`}
            </button>
          )}
        </>
      )}
    </Surface>
  );
}
