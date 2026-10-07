"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { syncCampaignsAction } from "@/app/actions";

type CampaignDatePickerProps = {
  initialFrom: string;
  initialTo: string;
};

const weekDays = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const monthFormatter = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" });
const dateFormatter = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });

export function CampaignDatePicker({ initialFrom, initialTo }: CampaignDatePickerProps) {
  const initialDate = parseDate(initialFrom) ?? new Date();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [selectingEnd, setSelectingEnd] = useState(!initialFrom || !initialTo);
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const [error, setError] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const days = buildCalendarDays(visibleMonth);
  const fromDate = parseDate(from);
  const toDate = parseDate(to);

  function selectDate(date: Date) {
    const selected = toIsoDate(date);
    if (!selectingEnd || !from) {
      setFrom(selected);
      setTo("");
      setSelectingEnd(true);
      setError("");
      return;
    }

    if (selected < from) {
      setFrom(selected);
      setTo(from);
    } else {
      setTo(selected);
    }
    setSelectingEnd(false);
    setError("");
  }

  function setPreset(range: "7days" | "30days" | "month") {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (range === "7days") start.setDate(start.getDate() - 6);
    if (range === "30days") start.setDate(start.getDate() - 29);
    if (range === "month") start.setDate(1);
    setFrom(toIsoDate(start));
    setTo(toIsoDate(today));
    setVisibleMonth(new Date(start.getFullYear(), start.getMonth(), 1));
    setSelectingEnd(false);
    setError("");
    setIsOpen(false);
  }

  return (
    <form action={syncCampaignsAction} className="campaign-date-form" onSubmit={(event) => {
      if (!from || !to) {
        event.preventDefault();
        setError("Kies eerst een start- en einddatum.");
      }
    }}>
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <div className="date-picker-control" ref={pickerRef}>
        <button
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label="Kies campagneperiode"
          className="date-picker-trigger"
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          <CalendarDays aria-hidden="true" size={20} />
          <span className="date-picker-values">
            <span>{fromDate ? dateFormatter.format(fromDate) : "Startdatum"}</span>
            <span className="date-picker-separator">tot</span>
            <span>{toDate ? dateFormatter.format(toDate) : "Einddatum"}</span>
          </span>
          <ChevronRight aria-hidden="true" className="date-picker-range-icon" size={16} />
        </button>
        {isOpen ? <div className="date-picker-popover" role="dialog" aria-label="Campagneperiode kiezen">
          <div className="date-picker-presets" aria-label="Snelle periodes">
            <button type="button" onClick={() => setPreset("7days")}>7 dagen</button>
            <button type="button" onClick={() => setPreset("30days")}>30 dagen</button>
            <button type="button" onClick={() => setPreset("month")}>Deze maand</button>
          </div>
          <div className="date-picker-month">
            <button aria-label="Vorige maand" className="date-picker-nav" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} type="button"><ChevronLeft size={18} /></button>
            <strong>{monthFormatter.format(visibleMonth)}</strong>
            <button aria-label="Volgende maand" className="date-picker-nav" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} type="button"><ChevronRight size={18} /></button>
          </div>
          <div className="date-picker-grid" role="grid" aria-label={monthFormatter.format(visibleMonth)}>
            {weekDays.map((day) => <span className="date-picker-weekday" key={day} role="columnheader">{day}</span>)}
            {days.map((date, index) => {
              if (!date) return <span aria-hidden="true" className="date-picker-empty" key={`empty-${index}`} />;
              const isoDate = toIsoDate(date);
              const inRange = Boolean(from && to && isoDate >= from && isoDate <= to);
              const isSelected = isoDate === from || isoDate === to;
              const isToday = isoDate === toIsoDate(new Date());
              return <button
                aria-label={dateFormatter.format(date)}
                aria-pressed={isSelected}
                className={`date-picker-day${inRange ? " in-range" : ""}${isSelected ? " selected" : ""}${isToday ? " today" : ""}`}
                key={isoDate}
                onClick={() => selectDate(date)}
                type="button"
              >{date.getDate()}</button>;
            })}
          </div>
          <p className="date-picker-hint">{selectingEnd ? "Kies de startdatum en daarna de einddatum." : "Periode geselecteerd."}</p>
        </div> : null}
      </div>
      <button className="button button-primary campaign-date-submit" type="submit"><RefreshCw size={16} /> Periode synchroniseren</button>
      {error ? <p className="form-error date-picker-error" role="alert">{error}</p> : null}
    </form>
  );
}

function buildCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const numberOfDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [
    ...Array<Date | null>(offset).fill(null),
    ...Array.from({ length: numberOfDays }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
  ];
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
