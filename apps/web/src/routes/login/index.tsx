import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { PpbError } from "@ppb/shared";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { LogoIcon } from "../../components/icons.tsx";
import { getToken, isDesktopApp, probeToken, setToken } from "../../lib/auth.ts";
import { errorText } from "../../lib/format.ts";

export const Route = createFileRoute("/login/")({
  beforeLoad: () => {
    if (getToken()) throw redirect({ to: "/profiles", replace: true });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = Route.useNavigate();
  const [token, setTokenValue] = useState("");

  const connect = useMutation({
    mutationFn: (value: string) => probeToken(value),
    onSuccess: (_status, value) => {
      setToken(value);
      void navigate({ to: "/profiles", replace: true });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (token.trim()) connect.mutate(token);
  };

  const failure = connect.error
    ? connect.error instanceof PpbError && connect.error.code === "UNAUTHORIZED"
      ? "That token was rejected. Run `ppb token` to print the current one."
      : errorText(connect.error)
    : undefined;

  return (
    <Center axis="both" padding={6} style={{ minHeight: "100%" }}>
      <VStack gap={4} hAlign="center" style={{ width: "100%", maxWidth: 420 }}>
        <VStack gap={2} hAlign="center">
          <Icon icon={LogoIcon} size="lg" />
          <Heading level={2}>pp-browser</Heading>
        </VStack>
        <Card padding={6} width="100%">
          {isDesktopApp() ? (
            <Text type="supporting">
              The app's session expired. Quit and reopen pp-browser to reconnect.
            </Text>
          ) : (
            <form onSubmit={submit}>
              <VStack gap={4}>
                <Text type="supporting">
                  Open this UI with <code>ppb ui</code>, or paste the token printed by{" "}
                  <code>ppb token</code>.
                </Text>
                <TextInput
                  label="API token"
                  type="password"
                  value={token}
                  onChange={setTokenValue}
                  hasAutoFocus
                  autoComplete="off"
                  status={failure ? { type: "error", message: failure } : undefined}
                />
                <Button
                  type="submit"
                  label="Connect"
                  variant="primary"
                  isLoading={connect.isPending}
                />
              </VStack>
            </form>
          )}
        </Card>
      </VStack>
    </Center>
  );
}
