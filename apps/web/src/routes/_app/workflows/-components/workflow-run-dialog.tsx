import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { ParamValues, Workflow } from "@ppb/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { getApi } from "../../../../lib/auth.ts";
import { errorText } from "../../../../lib/format.ts";
import { profilesQuery } from "../../../../lib/queries.ts";
import { RunResult } from "./run-result.tsx";

const FORM_ID = "workflow-run-form";

type FieldValue = string | boolean;

export function WorkflowRunDialog({
  workflow,
  onClose,
}: {
  workflow: Workflow;
  onClose: () => void;
}) {
  const { data: profiles } = useSuspenseQuery(profilesQuery);
  const queryClient = useQueryClient();
  const params = Object.entries(workflow.params);

  const [profile, setProfile] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    Object.fromEntries(
      params.map(([name, p]) => [
        name,
        p.type === "boolean" ? Boolean(p.default ?? false) : String(p.default ?? ""),
      ]),
    ),
  );
  const [showWindow, setShowWindow] = useState(false);
  const [keepPage, setKeepPage] = useState(false);

  const selected = profiles.find((p) => p.id === profile);
  const needsStart = selected !== undefined && selected.runtime.status !== "running";

  const run = useMutation({
    mutationFn: () => {
      // Empty text fields are left out so the declared default (or "required" check) applies.
      const given: ParamValues = {};
      for (const [name, value] of Object.entries(values)) {
        if (typeof value === "boolean" || value !== "") given[name] = value;
      }
      return getApi().runWorkflow(workflow.id, {
        profile: profile!,
        params: given,
        keepPage: keepPage || undefined,
        headless: needsStart && showWindow ? false : undefined,
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["profiles"] }),
  });

  const missingRequired = params.some(
    ([name, p]) => p.required && p.default === undefined && values[name] === "",
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run.mutate();
  };

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} purpose="form" width={720}>
      <Layout
        header={
          <DialogHeader
            title={`Run ${workflow.name}`}
            subtitle={`Version ${workflow.version} · ${workflow.stepCount} steps`}
            onOpenChange={() => onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              <form id={FORM_ID} onSubmit={submit}>
                <FormLayout>
                  <Selector
                    label="Profile"
                    placeholder="Choose a profile"
                    hasClear
                    value={profile}
                    onChange={setProfile}
                    options={profiles.map((p) => ({
                      value: p.id,
                      label: p.name,
                      description: p.runtime.status,
                    }))}
                  />
                  {params.map(([name, p]) =>
                    p.type === "boolean" ? (
                      <CheckboxInput
                        key={name}
                        label={name}
                        description={p.description}
                        value={values[name] === true}
                        onChange={(checked) => setValues((prev) => ({ ...prev, [name]: checked }))}
                      />
                    ) : (
                      <TextInput
                        key={name}
                        label={name}
                        description={p.description}
                        type={p.type === "secret" ? "password" : "text"}
                        isRequired={p.required && p.default === undefined}
                        isOptional={!p.required || p.default !== undefined}
                        placeholder={p.type === "number" ? "number" : undefined}
                        value={String(values[name] ?? "")}
                        onChange={(value) => setValues((prev) => ({ ...prev, [name]: value }))}
                      />
                    ),
                  )}
                  {needsStart && (
                    <CheckboxInput
                      label="Show the browser window"
                      description="The profile is not running; it will be started for this run."
                      value={showWindow}
                      onChange={setShowWindow}
                    />
                  )}
                  <CheckboxInput
                    label="Keep the page open afterwards"
                    value={keepPage}
                    onChange={setKeepPage}
                  />
                </FormLayout>
              </form>
              {run.error && (
                <Banner status="error" title="Run failed" description={errorText(run.error)} />
              )}
              {run.data && <RunResult result={run.data} />}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label="Close" variant="ghost" onClick={onClose} />
              <Button
                type="submit"
                form={FORM_ID}
                label={run.data ? "Run again" : "Run"}
                variant="primary"
                isLoading={run.isPending}
                isDisabled={!profile || missingRequired}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
