import type { RecordingResult, WorkflowStep } from "@ppb/shared";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export class Recorder {
  #steps: WorkflowStep[] = [];
  #warnings: string[] = [];
  #pageId: string | null = null;
  #next = 1;

  add(pageId: string, step: DistributiveOmit<WorkflowStep, "id">): void {
    const id = `s${this.#next++}`;
    if (this.#pageId === null) {
      this.#pageId = pageId;
    } else if (this.#pageId !== pageId) {
      this.#warnings.push(
        `step ${id} ran on page ${pageId}, recording started on ${this.#pageId}; workflows replay on a single page`,
      );
    }
    this.#steps.push({ ...step, id } as WorkflowStep);
  }

  skip(action: string, target: string, reason: string): void {
    this.#warnings.push(`${action} ${target} not recorded: ${reason}`);
  }

  note(message: string): void {
    this.#warnings.push(message);
  }

  finish(): RecordingResult {
    return { steps: this.#steps, warnings: this.#warnings };
  }
}
