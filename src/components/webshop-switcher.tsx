"use client";

import { useState, useTransition } from "react";
import { Store } from "lucide-react";
import { setWebshopScopeAction } from "@/app/webshop-actions";

export function WebshopSwitcher({ options, current }: { options: { id: string; name: string }[]; current: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  if (options.length < 2) {
    return <div className="webshop-switcher webshop-switcher-fixed"><Store size={15} /><span>{options[0]?.name}</span></div>;
  }

  return (
    <label className="webshop-switcher">
      <Store size={15} />
      <span className="sr-only">Webshop</span>
      <select aria-label="Kies een webshop" disabled={pending} onChange={(event) => {
        const scope = event.target.value;
        setError(false);
        startTransition(async () => {
          const result = await setWebshopScopeAction(scope);
          if (!result.ok) setError(true);
        });
      }} value={current}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      {error ? <span className="form-error" role="alert">Wisselen is mislukt.</span> : null}
    </label>
  );
}
