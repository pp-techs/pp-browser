import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { TextArea } from "@astryxdesign/core/TextArea";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { PpbError, workflowDefinitionSchema } from "@ppb/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import * as z from "zod";
import { getApi } from "../../../../lib/auth.ts";
import { errorText } from "../../../../lib/format.ts";

const FORM_ID = "workflow-import-form";
const PLACEHOLDER = '{\n  "name": "post-to-site",\n  "params": {},\n  "steps": [\n    …\n  ]\n}';

export function WorkflowImportDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new PpbError("INVALID_INPUT", `Invalid JSON: ${errorText(error)}`);
      }
      const parsed = workflowDefinitionSchema.safeParse(data);
      if (!parsed.success) throw new PpbError("INVALID_INPUT", z.prettifyError(parsed.error));
      return getApi().saveWorkflow(parsed.data);
    },
    onSuccess: async (workflow) => {
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast({ body: `Saved ${workflow.name} v${workflow.version}` });
      onClose();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) setText(await file.text());
  };

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} purpose="form" width={640}>
      <Layout
        header={
          <DialogHeader
            title="Import workflow"
            subtitle="Saving an existing name creates a new version."
            onOpenChange={() => onClose()}
          />
        }
        content={
          <LayoutContent>
            <form id={FORM_ID} onSubmit={submit}>
              <VStack gap={3}>
                <TextArea
                  label="Workflow definition (JSON)"
                  hasAutoFocus
                  rows={14}
                  placeholder={PLACEHOLDER}
                  value={text}
                  onChange={setText}
                />
                <input
                  ref={fileInput}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={loadFile}
                />
                {save.error && (
                  <Banner
                    status="error"
                    title="Could not save"
                    description={errorText(save.error)}
                  />
                )}
              </VStack>
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="between">
              <Button label="Load file…" onClick={() => fileInput.current?.click()} />
              <HStack gap={2}>
                <Button label="Cancel" variant="ghost" onClick={onClose} />
                <Button
                  type="submit"
                  form={FORM_ID}
                  label="Save"
                  variant="primary"
                  isLoading={save.isPending}
                  isDisabled={!text.trim()}
                />
              </HStack>
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
