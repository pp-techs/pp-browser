import { Badge } from "@astryxdesign/core/Badge";
import { Code } from "@astryxdesign/core/Code";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { WorkflowStep } from "@ppb/shared";
import type { ReactNode } from "react";
import { describeCondition, describeStep } from "../../../../lib/workflow-format.ts";

const NESTED = {
  paddingInlineStart: 16,
  marginInlineStart: 6,
  borderInlineStart: "1px solid color-mix(in srgb, currentColor 18%, transparent)",
} as const;

export function StepTree({ steps }: { steps: WorkflowStep[] }) {
  return (
    <VStack gap={2}>
      {steps.map((step) => (
        <StepNode key={step.id} step={step} />
      ))}
    </VStack>
  );
}

function Branch({ title, children }: { title: string; children: ReactNode }) {
  return (
    <VStack gap={1.5} style={NESTED}>
      <Text type="supporting" size="sm" weight="medium">
        {title}
      </Text>
      {children}
    </VStack>
  );
}

function StepNode({ step }: { step: WorkflowStep }) {
  const { label, detail } = describeStep(step);
  return (
    <VStack gap={1.5}>
      <HStack gap={1.5} vAlign="center" wrap="wrap">
        <Text type="supporting" size="sm">
          {step.id}
        </Text>
        <Text weight="medium">{label}</Text>
        {detail && <Code>{detail}</Code>}
        {step.optional && <Badge variant="neutral" label="optional" />}
        {step.onFail && step.onFail !== "needs_agent" && (
          <Badge variant="warning" label={`on fail: ${step.onFail}`} />
        )}
      </HStack>
      {step.do === "if" && (
        <>
          <Branch title="then">
            <StepTree steps={step.then} />
          </Branch>
          {step.else && (
            <Branch title="else">
              <StepTree steps={step.else} />
            </Branch>
          )}
        </>
      )}
      {step.do === "switch" && (
        <>
          {step.cases.map((c, i) => (
            <Branch key={i} title={`when ${describeCondition(c.cond)}`}>
              {c.steps.length > 0 ? (
                <StepTree steps={c.steps} />
              ) : (
                <Text type="supporting" size="sm">
                  no steps
                </Text>
              )}
            </Branch>
          ))}
          {step.default && (
            <Branch title="otherwise">
              <StepTree steps={step.default} />
            </Branch>
          )}
        </>
      )}
    </VStack>
  );
}
