import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";

export function PageHeader(props: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <HStack gap={4} hAlign="between" vAlign="center" wrap="wrap">
      <VStack gap={1}>
        <Heading level={1}>{props.title}</Heading>
        {props.description && <Text type="supporting">{props.description}</Text>}
      </VStack>
      {props.actions && (
        <HStack gap={2} vAlign="center">
          {props.actions}
        </HStack>
      )}
    </HStack>
  );
}
