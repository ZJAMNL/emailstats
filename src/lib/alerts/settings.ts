import { alertRules } from "./rules";

export type AlertRuleSettings = { enabled: boolean; params: Record<string, number> };

export type AlertSettingsValue = {
  enabled: boolean;
  recipients: string[];
  rules: Record<string, AlertRuleSettings>;
};

export const MAX_RECIPIENTS = 10;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/**
 * Saved settings merged with the defaults: a rule or threshold that was never saved (or was added
 * later) uses its default, and saved thresholds are clamped to the allowed range.
 */
export function readAlertRules(value: unknown): Record<string, AlertRuleSettings> {
  const saved = asRecord(value);
  return Object.fromEntries(alertRules.map((rule) => {
    const savedRule = asRecord(saved[rule.key]);
    const params = Object.fromEntries(rule.thresholds.map((field) => {
      const raw = Number(asRecord(savedRule.params)[field.key]);
      return [field.key, Number.isFinite(raw) ? Math.min(field.max, Math.max(field.min, raw)) : field.defaultValue];
    }));
    return [rule.key, { enabled: typeof savedRule.enabled === "boolean" ? savedRule.enabled : rule.defaultEnabled, params }];
  }));
}

export function readAlertSettings(row: { enabled: boolean; recipients: string[]; rules: unknown } | null, defaultRecipients: string[] = []): AlertSettingsValue {
  return {
    enabled: row?.enabled ?? false,
    recipients: row ? row.recipients : defaultRecipients,
    rules: readAlertRules(row?.rules),
  };
}

/** Unique, lower-cased, valid addresses; null when any entry is not an e-mail address. */
export function cleanRecipients(input: unknown) {
  if (!Array.isArray(input)) return null;
  const addresses = input.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);
  if (addresses.some((address) => address.length > 254 || !emailPattern.test(address))) return null;
  return [...new Set(addresses)].slice(0, MAX_RECIPIENTS);
}

/** Validated settings from the admin form, or an error message in Dutch. */
export function validateAlertSettings(input: unknown): { ok: true; value: AlertSettingsValue } | { ok: false; error: string } {
  const record = asRecord(input);
  const recipients = cleanRecipients(record.recipients);
  if (!recipients) return { ok: false, error: "Een of meer ontvangers zijn geen geldig e-mailadres." };
  const enabled = record.enabled === true;
  if (enabled && !recipients.length) return { ok: false, error: "Vul minstens één ontvanger in om alerts aan te zetten." };
  return { ok: true, value: { enabled, recipients, rules: readAlertRules(record.rules) } };
}
