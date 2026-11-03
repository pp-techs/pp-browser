import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import { osSchema, type Profile, type ProfileOs } from "@ppb/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { getApi } from "../../../../lib/auth.ts";
import { errorText } from "../../../../lib/format.ts";
import { proxiesQuery, statusQuery } from "../../../../lib/queries.ts";

const OS_LABELS: Record<ProfileOs, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };
const FORM_ID = "profile-form";

interface ProfileDialogProps {
  /** Profile being edited; null creates a new one. */
  profile: Profile | null;
  onClose: () => void;
}

export function ProfileDialog({ profile, onClose }: ProfileDialogProps) {
  const { data: proxies } = useSuspenseQuery(proxiesQuery);
  const { data: status } = useSuspenseQuery(statusQuery);
  const queryClient = useQueryClient();
  const toast = useToast();

  const [name, setName] = useState(profile?.name ?? "");
  const [group, setGroup] = useState(profile?.group ?? "");
  const [notes, setNotes] = useState(profile?.notes ?? "");
  const [proxyId, setProxyId] = useState(profile?.proxy?.id ?? "");
  const [os, setOs] = useState<ProfileOs | undefined>(undefined);

  const macHost = status.hostPlatform === "darwin";
  const save = useMutation({
    mutationFn: async () => {
      const api = getApi();
      if (profile)
        return api.updateProfile(profile.id, { name, group, notes, proxyId: proxyId || null });
      return api.createProfile({ name, group, notes, proxyId: proxyId || null, os });
    },
    onSuccess: async (saved) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profiles"] }),
        queryClient.invalidateQueries({ queryKey: ["proxies"] }),
      ]);
      toast({ body: profile ? `Saved ${saved.name}` : `Created ${saved.name}` });
      onClose();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} purpose="form" width={520}>
      <Layout
        header={
          <DialogHeader
            title={profile ? `Edit ${profile.name}` : "New profile"}
            subtitle={
              profile ? undefined : "A fingerprint is generated once and reused on every launch."
            }
            onOpenChange={() => onClose()}
          />
        }
        content={
          <LayoutContent>
            <form id={FORM_ID} onSubmit={submit}>
              <FormLayout>
                <TextInput
                  label="Name"
                  isRequired
                  hasAutoFocus
                  placeholder="fb-01"
                  value={name}
                  onChange={setName}
                />
                <TextInput
                  label="Group"
                  isOptional
                  placeholder="marketing"
                  description="Used to filter the profile list."
                  value={group}
                  onChange={setGroup}
                />
                <Selector
                  label="Proxy"
                  placeholder="Direct connection (no proxy)"
                  hasClear
                  description={
                    profile?.runtime.status === "running"
                      ? "Proxy changes apply on the next launch."
                      : undefined
                  }
                  value={proxyId || null}
                  options={proxies.map((p) => ({
                    value: p.id,
                    label: p.name,
                    description:
                      p.profileCount > 0 && p.id !== profile?.proxy?.id
                        ? `${p.url} · used by ${p.profileCount}`
                        : p.url,
                  }))}
                  onChange={(value) => setProxyId(value ?? "")}
                />
                {profile ? (
                  <Text type="supporting" size="sm">
                    Fingerprint: {OS_LABELS[profile.identity.os]}, {profile.identity.screen.width}×
                    {profile.identity.screen.height}, {profile.identity.webgl.renderer}. Fixed at
                    creation.
                  </Text>
                ) : (
                  <>
                    <Selector
                      label="Fingerprint OS"
                      placeholder={
                        macHost
                          ? "Default (macOS, matches this Mac)"
                          : "Random (weighted by market share)"
                      }
                      hasClear
                      value={os ?? null}
                      options={osSchema.options.map((value) => ({
                        value,
                        label: OS_LABELS[value],
                      }))}
                      onChange={(value) => setOs(osSchema.options.find((o) => o === value))}
                    />
                    {macHost && os && os !== "macos" && (
                      <Banner
                        status="warning"
                        title="Visible windows may render text incorrectly"
                        description="On macOS, Camoufox draws text in its bundled Windows/Linux fonts with wrong glyphs in visible windows (daijro/camoufox#918). Fine for headless and agent use; pick macOS for manual browsing."
                      />
                    )}
                  </>
                )}
                <TextArea label="Notes" isOptional rows={3} value={notes} onChange={setNotes} />
                {save.error && (
                  <Banner
                    status="error"
                    title="Could not save"
                    description={errorText(save.error)}
                  />
                )}
              </FormLayout>
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label="Cancel" variant="ghost" onClick={onClose} />
              <Button
                type="submit"
                form={FORM_ID}
                label={profile ? "Save" : "Create"}
                variant="primary"
                isLoading={save.isPending}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
