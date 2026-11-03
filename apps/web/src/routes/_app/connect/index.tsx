import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { getToken } from "../../../lib/auth.ts";

export const Route = createFileRoute("/_app/connect/")({
  component: ConnectSetup,
});

const MASK = "•".repeat(12);

function ConnectSetup() {
  const [reveal, setReveal] = useState(false);
  const origin = window.location.origin;
  const token = reveal ? (getToken() ?? "") : MASK;

  const stdio = JSON.stringify({ mcpServers: { ppb: { command: "ppb", args: ["mcp"] } } }, null, 2);
  const http = JSON.stringify(
    {
      mcpServers: {
        ppb: { type: "http", url: `${origin}/mcp`, headers: { Authorization: `Bearer ${token}` } },
      },
    },
    null,
    2,
  );
  const rest = `curl -H "Authorization: Bearer ${token}" ${origin}/api/profiles`;

  return (
    <VStack gap={4}>
      <HStack hAlign="end">
        <Button
          label={reveal ? "Hide token" : "Show token"}
          onClick={() => setReveal((value) => !value)}
        />
      </HStack>
      <Grid columns={{ minWidth: 340, repeat: "fit" }} gap={4}>
        <SetupCard
          title="MCP over stdio"
          description="For Claude Desktop, Claude Code, Cursor… The command bridges to this daemon."
        >
          <CodeBlock code={stdio} language="json" hasCopyButton />
        </SetupCard>
        <SetupCard
          title="MCP over HTTP"
          description="Streamable HTTP endpoint for remote or long-lived agents."
        >
          <CodeBlock code={http} language="json" hasCopyButton={reveal} />
        </SetupCard>
        <SetupCard title="REST API" description="The same operations as plain JSON over HTTP.">
          <CodeBlock code={rest} language="bash" hasCopyButton={reveal} isWrapped />
        </SetupCard>
      </Grid>
      {!reveal && <Text type="supporting">Reveal the token to copy snippets that include it.</Text>}
    </VStack>
  );
}

function SetupCard(props: { title: string; description: string; children: ReactNode }) {
  return (
    <Card padding={5}>
      <VStack gap={3}>
        <VStack gap={1}>
          <Heading level={3}>{props.title}</Heading>
          <Text type="supporting">{props.description}</Text>
        </VStack>
        {props.children}
      </VStack>
    </Card>
  );
}
