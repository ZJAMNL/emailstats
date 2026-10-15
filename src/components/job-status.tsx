"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

export type JobStatusData = { id: string; steps: { key: string; label: string }[]; stepIndex: number; status: string; progress: string | null; error: string | null; createdAt: string; finishedAt: string | null; trigger: string };

const time = (value: string) => new Date(value).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });

/**
 * The background job of this customer: the steps with the current one highlighted, and the progress.
 * While it runs, the page refreshes itself every few seconds.
 */
export function JobStatus({ job }: { job: JobStatusData | null }) {
  const router = useRouter();
  const active = job?.status === "queued" || job?.status === "running";
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [active, router]);

  if (!job) return null;
  const Icon = active ? Loader2 : job.status === "failed" ? AlertTriangle : CheckCircle2;
  const title = active ? (job.status === "queued" && job.stepIndex === 0 ? "In de wachtrij" : "Bezig op de achtergrond") : job.status === "failed" ? "Taak mislukt" : "Taak afgerond";

  return (
    <section aria-live="polite" className={`panel job-status is-${job.status}`}>
      <div className="job-status-head">
        <Icon className={active ? "spin" : undefined} size={18} />
        <strong>{title}</strong>
        <small>{job.trigger === "nightly" ? "nachtelijke taak" : "handmatig gestart"} · {time(job.createdAt)}{job.finishedAt ? ` – ${time(job.finishedAt)}` : ""}</small>
      </div>
      <ol className="job-steps">
        {job.steps.map((step, index) => (
          <li className={index < job.stepIndex || job.status === "done" ? "is-done" : index === job.stepIndex && job.status !== "done" ? `is-current${job.status === "failed" ? " is-failed" : ""}` : undefined} key={step.key}>{step.label}</li>
        ))}
      </ol>
      {job.status === "failed" && job.error ? <p className="form-error" role="alert">{job.error}</p> : job.progress ? <p className="job-progress">{job.progress}</p> : null}
    </section>
  );
}
