import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { setColorMode, useColorMode, type ColorMode } from "../../../lib/color-mode.ts";
import { statusQuery } from "../../../lib/queries.ts";

const SECTIONS = [
  { id: "appearance", label: "Appearance" },
  { id: "about", label: "About" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const MODES: ColorMode[] = ["system", "light", "dark"];
const MODE_LABELS: Record<ColorMode, string> = { system: "Auto", light: "Light", dark: "Dark" };

export interface SettingsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function SettingsDialog({ isOpen, onOpenChange }: SettingsDialogProps) {
  const [section, setSection] = useState<SectionId>("appearance");

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={720}>
      <Layout
        header={
          <DialogHeader
            title="Settings"
            subtitle="Preferences are stored in this browser."
            onOpenChange={(open) => !open && onOpenChange(false)}
          />
        }
        content={
          <LayoutContent>
            <HStack gap={4} vAlign="start">
              <VStack width={160} style={{ flexShrink: 0 }}>
                <List density="compact" edge="outset">
                  {SECTIONS.map((item) => (
                    <ListItem
                      key={item.id}
                      label={item.label}
                      isSelected={section === item.id}
                      onClick={() => setSection(item.id)}
                    />
                  ))}
                </List>
              </VStack>
              <VStack width="100%" gap={4} style={{ minWidth: 0 }}>
                {section === "appearance" ? <AppearanceSection /> : <AboutSection />}
              </VStack>
            </HStack>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}

function AppearanceSection() {
  const mode = useColorMode();

  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={3}>Appearance</Heading>
        <Text type="supporting">Choose how PP Browser looks on this device.</Text>
      </VStack>
      <VStack gap={2}>
        <Text type="label">Color theme</Text>
        <SegmentedControl
          label="Color theme"
          value={mode}
          onChange={(next) => setColorMode(MODES.find((m) => m === next) ?? "system")}
        >
          {MODES.map((m) => (
            <SegmentedControlItem key={m} value={m} label={MODE_LABELS[m]} />
          ))}
        </SegmentedControl>
        <Text type="supporting" size="sm">
          Auto follows the system setting.
        </Text>
      </VStack>
    </VStack>
  );
}

function AboutSection() {
  const { data: status } = useSuspenseQuery(statusQuery);

  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={3}>About</Heading>
        <Text type="supporting">Multi-profile anti-detect browser manager.</Text>
      </VStack>
      <MetadataList label={{ position: "start", width: 160 }}>
        <MetadataListItem label="Name">PP Browser</MetadataListItem>
        <MetadataListItem label="Version">{status.version}</MetadataListItem>
        <MetadataListItem label="Profiles running">
          {status.running} / {status.maxRunning}
        </MetadataListItem>
        <MetadataListItem label="Camoufox">
          {status.camoufox.installed
            ? (status.camoufox.version ?? "Installed")
            : "Downloads on first launch"}
        </MetadataListItem>
      </MetadataList>
    </VStack>
  );
}
