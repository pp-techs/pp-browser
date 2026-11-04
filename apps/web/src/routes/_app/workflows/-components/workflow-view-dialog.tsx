import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { Workflow } from "@ppb/shared";
import { StepTree } from "./step-tree.tsx";

export function WorkflowViewDialog({
  workflow,
  onClose,
}: {
  workflow: Workflow;
  onClose: () => void;
}) {
  const params = Object.entries(workflow.params);
  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} width={720}>
      <Layout
        header={
          <DialogHeader
            title={workflow.name}
            subtitle={`Version ${workflow.version} · ${workflow.stepCount} steps${workflow.description ? ` · ${workflow.description}` : ""}`}
            onOpenChange={() => onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              {params.length > 0 && (
                <VStack gap={1.5}>
                  <Text weight="medium">Parameters</Text>
                  {params.map(([name, param]) => (
                    <HStack key={name} gap={1.5} vAlign="center" wrap="wrap">
                      <Text>{name}</Text>
                      <Badge
                        variant={param.type === "secret" ? "warning" : "neutral"}
                        label={param.type}
                      />
                      {param.required && <Badge variant="neutral" label="required" />}
                      {param.default !== undefined && param.type !== "secret" && (
                        <Text type="supporting" size="sm">
                          default {JSON.stringify(param.default)}
                        </Text>
                      )}
                      {param.description && (
                        <Text type="supporting" size="sm">
                          {param.description}
                        </Text>
                      )}
                    </HStack>
                  ))}
                </VStack>
              )}
              <VStack gap={2}>
                <Text weight="medium">Steps</Text>
                <StepTree steps={workflow.definition.steps} />
              </VStack>
              <Collapsible trigger="JSON">
                <CodeBlock
                  code={JSON.stringify(workflow.definition, null, 2)}
                  language="json"
                  hasCopyButton
                  maxHeight={320}
                />
              </Collapsible>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label="Close" variant="ghost" onClick={onClose} />
              <Button
                label="Run"
                variant="primary"
                href={`/workflows/${encodeURIComponent(workflow.id)}/run`}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
