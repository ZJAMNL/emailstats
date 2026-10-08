"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { updateCopernicaSelectionsAction } from "@/app/actions";

export type SelectionPickerOption = {
  id: string;
  copernicaId: string;
  name: string;
  enabled: boolean;
  profileCount: number | null;
};

const pageSize = 30;
const otherGroup = "Overig";

export function SelectionPicker({ options }: { options: SelectionPickerOption[] }) {
  const initialSelected = useMemo(() => new Set(options.filter((option) => option.enabled).map((option) => option.id)), [options]);
  const [selected, setSelected] = useState(initialSelected);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [onlySelected, setOnlySelected] = useState(false);
  const [visibleCount, setVisibleCount] = useState(pageSize);

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const option of options) counts.set(option.name, (counts.get(option.name) ?? 0) + 1);
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  }, [options]);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const option of options) counts.set(groupOf(option.name), (counts.get(groupOf(option.name)) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => (a === otherGroup ? 1 : b === otherGroup ? -1 : a.localeCompare(b)));
  }, [options]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((option) =>
      (!needle || option.name.toLowerCase().includes(needle))
      && (!group || groupOf(option.name) === group)
      && (!onlySelected || selected.has(option.id)));
  }, [options, query, group, onlySelected, selected]);

  const selectedOptions = options.filter((option) => selected.has(option.id));
  const isDirty = selected.size !== initialSelected.size || [...selected].some((id) => !initialSelected.has(id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetPaging() {
    setVisibleCount(pageSize);
  }

  return (
    <form action={updateCopernicaSelectionsAction} className="selection-picker">
      {[...selected].map((id) => <input key={id} name="selectionId" type="hidden" value={id} />)}

      <div className="selection-picker-chosen" aria-label="Gekozen selecties">
        {selectedOptions.length ? selectedOptions.map((option) => (
          <span className="selection-chip" key={option.id}>
            {option.name}
            {option.profileCount !== null ? <small>{option.profileCount.toLocaleString("nl-NL")}</small> : null}
            <button aria-label={`${option.name} niet meer volgen`} onClick={() => toggle(option.id)} type="button"><X size={13} /></button>
          </span>
        )) : <p className="selection-picker-hint">Nog niets gekozen. Zoek hieronder een selectie en vink hem aan.</p>}
      </div>

      <div className="selection-picker-toolbar">
        <label className="selection-search">
          <Search size={16} />
          <input aria-label="Zoek selectie" onChange={(event) => { setQuery(event.target.value); resetPaging(); }} placeholder={`Zoek in ${options.length.toLocaleString("nl-NL")} selecties`} type="search" value={query} />
        </label>
        <label className="selection-only-selected"><input checked={onlySelected} onChange={(event) => { setOnlySelected(event.target.checked); resetPaging(); }} type="checkbox" /> Alleen gekozen</label>
      </div>

      {groups.length > 1 ? <div className="selection-groups" role="group" aria-label="Filter op prefix">
        <button aria-pressed={group === null} className="selection-group" onClick={() => { setGroup(null); resetPaging(); }} type="button">Alle</button>
        {groups.map(([name, count]) => <button aria-pressed={group === name} className="selection-group" key={name} onClick={() => { setGroup(group === name ? null : name); resetPaging(); }} type="button">{name} <small>{count}</small></button>)}
      </div> : null}

      {filtered.length ? <ul className="selection-results">
        {filtered.slice(0, visibleCount).map((option) => (
          <li key={option.id}>
            <label>
              <input checked={selected.has(option.id)} onChange={() => toggle(option.id)} type="checkbox" />
              <span>{option.name}{duplicateNames.has(option.name) ? <small> · ID {option.copernicaId}</small> : null}</span>
              {option.profileCount !== null ? <small>{option.profileCount.toLocaleString("nl-NL")}</small> : null}
            </label>
          </li>
        ))}
      </ul> : <p className="empty-state">Geen selecties gevonden.</p>}

      {filtered.length > visibleCount ? <button className="button button-secondary selection-more" onClick={() => setVisibleCount((count) => count + pageSize)} type="button">Toon meer ({(filtered.length - visibleCount).toLocaleString("nl-NL")} over)</button> : null}

      {isDirty ? <div className="selection-savebar" role="status">
        <span>{selected.size} {selected.size === 1 ? "selectie" : "selecties"} gekozen · niet opgeslagen</span>
        <div>
          <button className="button button-secondary" onClick={() => setSelected(initialSelected)} type="button">Ongedaan maken</button>
          <button className="button button-primary" type="submit">Opslaan</button>
        </div>
      </div> : null}
    </form>
  );
}

function groupOf(name: string) {
  const match = /^([A-Za-z])_/.exec(name);
  return match ? `${match[1].toUpperCase()}_` : otherGroup;
}
