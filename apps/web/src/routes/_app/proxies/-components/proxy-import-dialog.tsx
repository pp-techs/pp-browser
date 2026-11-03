import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { TextArea } from "@astryxdesign/core/TextArea";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { getApi } from "../../../../lib/auth.ts";
import { errorText } from "../../../../lib/format.ts";

const FORM_ID = "proxy-import-form";
const PLACEHOLDER =
  "socks5://user:pass@1.2.3.4:1080\nhttp://user:pass@proxy.example:8000\n1.2.3.4:8000:user:pass";

export function ProxyImportDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");

  const importer = useMutation({
    mutationFn: () => getApi().importProxies(text),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["proxies"] });
      if (result.errors.length === 0) {
        toast({ body: `Imported ${result.created.length} proxies` });
        onClose();
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    importer.mutate();
  };

  const result = importer.data;
  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} purpose="form" width={560}>
      <Layout
        header={
          <DialogHeader
            title="Add proxies"
            subtitle="Supported: http, https, socks4, socks5. Names default to host-port."
            onOpenChange={() => onClose()}
          />
        }
        content={
          <LayoutContent>
            <form id={FORM_ID} onSubmit={submit}>
              <VStack gap={3}>
                <TextArea
                  label="One proxy per line"
                  hasAutoFocus
                  rows={8}
                  placeholder={PLACEHOLDER}
                  value={text}
                  onChange={setText}
                />
                {importer.error && (
                  <Banner
                    status="error"
                    title="Import failed"
                    description={errorText(importer.error)}
                  />
                )}
                {result && result.errors.length > 0 && (
                  <Banner
                    status="warning"
                    title={`Imported ${result.created.length}, ${result.errors.length} line(s) skipped`}
                    description={result.errors.map((e) => `line ${e.line}: ${e.error}`).join("\n")}
                  />
                )}
              </VStack>
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={result ? "Done" : "Cancel"} variant="ghost" onClick={onClose} />
              <Button
                type="submit"
                form={FORM_ID}
                label="Import"
                variant="primary"
                isLoading={importer.isPending}
                isDisabled={!text.trim()}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
