import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Spinner } from "@astryxdesign/core/Spinner";
import { VStack } from "@astryxdesign/core/VStack";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { errorText } from "../lib/format.ts";

export function PendingView() {
  return (
    <Center axis="both" padding={8} style={{ minHeight: "100%" }}>
      <Spinner size="lg" label="Loading" />
    </Center>
  );
}

export function ErrorView({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <VStack gap={3} padding={6}>
      <Banner status="error" title="Something went wrong" description={errorText(error)} />
      <div>
        <Button label="Try again" onClick={() => router.invalidate()} />
      </div>
    </VStack>
  );
}

export function NotFoundView() {
  return (
    <Center axis="both" padding={8} style={{ minHeight: "100%" }}>
      <EmptyState
        title="Page not found"
        description="This address does not match anything in pp-browser."
        actions={<Button label="Back to profiles" variant="primary" href="/profiles" />}
      />
    </Center>
  );
}
