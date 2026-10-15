import { after } from "next/server";
import { enqueueJob, kickWorker } from "./queue";
import { stepLabel, type JobStep, type StepContext } from "./steps";

export type StartResult = { queued: boolean; message: string };

/**
 * For buttons: put the work in the queue and start a worker after the response, so the page answers
 * at once and shows the progress instead of waiting (and breaking) on a large customer.
 */
export async function startJob(tenantId: string, steps: JobStep[], requestedBy: string, params?: StepContext["params"]): Promise<StartResult> {
  const { job, created } = await enqueueJob(tenantId, steps, { trigger: "manual", requestedBy, params });
  after(() => kickWorker());
  if (created) return { queued: true, message: "Gestart op de achtergrond: de voortgang staat bovenaan de pagina. Je kunt deze pagina gewoon verlaten." };
  const current = job.steps[job.stepIndex] as JobStep | undefined;
  return { queued: false, message: `Er loopt al een taak voor deze klant${current ? ` (${stepLabel[current].toLowerCase()})` : ""}. Wacht tot die klaar is; de nachtelijke taak neemt alles mee.` };
}
