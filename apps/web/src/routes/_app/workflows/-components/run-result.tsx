import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { HStack } from "@astryxdesign/core/HStack";
import { Table, pixel, proportional, type TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { RunStatus, StepLog, StepStatus, WorkflowRunResult } from "@ppb/shared";

type BadgeVariant = "success" | "warning" | "error" | "neutral";

const RUN_VARIANT: Record<RunStatus, BadgeVariant> = {
  succeeded: "success",
  failed: "error",
  needs_agent: "warning",
};
const STEP_VARIANT: Record<StepStatus, BadgeVariant> = {
  ok: "success",
  skipped: "neutral",
  continued: "warning",
  failed: "error",
};

const columns: TableColumn<StepLog>[] = [
  { key: "path", header: "Path", width: pixel(150) },
  { key: "id", header: "Step", width: pixel(80) },
  { key: "do", header: "Action", width: pixel(100) },
  {
    key: "status",
    header: "Status",
    width: pixel(110),
    renderCell: (l) => <Badge variant={STEP_VARIANT[l.status]} label={l.status} />,
  },
  {
    key: "detail",
    header: "Detail",
    width: proportional(1, { minWidth: 160 }),
    renderCell: (l) => (
      <Text size="sm" type={l.error ? undefined : "supporting"}>
        {l.error ?? l.branch ?? ""}
      </Text>
    ),
  },
  { key: "ms", header: "ms", align: "end", width: pixel(70) },
];

export function RunResult({ result }: { result: WorkflowRunResult }) {
  const outputs = Object.entries(result.outputs);
  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Badge variant={RUN_VARIANT[result.status]} label={result.status.replace("_", " ")} />
        <Text type="supporting" size="sm">
          {result.workflow} v{result.version} on {result.profile} · page {result.pageId} ·{" "}
          {result.durationMs} ms
        </Text>
      </HStack>

      {result.failedStep && (
        <Banner
          status={result.status === "failed" ? "error" : "warning"}
          title={`Step ${result.failedStep.id} (${result.failedStep.path}) failed`}
          description={
            result.status === "needs_agent"
              ? `${result.failedStep.error}\nThe page stays open as ${result.pageId}. An agent can fix the step with save_workflow and run it again.`
              : result.failedStep.error
          }
        />
      )}

      {outputs.length > 0 && (
        <VStack gap={1}>
          <Text weight="medium">Extracted</Text>
          {outputs.map(([id, value]) => (
            <Text key={id} size="sm">
              <Text as="span" type="supporting" size="sm">
                {id}:
              </Text>{" "}
              {value}
            </Text>
          ))}
        </VStack>
      )}

      {result.screenshots.map((shot) => (
        <VStack key={shot.stepId} gap={1}>
          <Text type="supporting" size="sm">
            Screenshot from {shot.stepId}
          </Text>
          <img
            alt={`Screenshot from step ${shot.stepId}`}
            src={`data:image/png;base64,${shot.data}`}
            style={{ maxWidth: "100%", borderRadius: 8 }}
          />
        </VStack>
      ))}

      <Table data={result.log} columns={columns} idKey="path" />

      {result.snapshot && (
        <Collapsible trigger="Page snapshot" defaultIsOpen={result.status === "needs_agent"}>
          <CodeBlock code={result.snapshot} language="yaml" hasCopyButton maxHeight={280} />
        </Collapsible>
      )}
    </VStack>
  );
}
