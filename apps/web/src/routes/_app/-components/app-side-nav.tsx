import { NavIcon } from "@astryxdesign/core/NavIcon";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { useRouterState } from "@tanstack/react-router";
import {
  ConnectIcon,
  LogoIcon,
  ProfilesIcon,
  ProxiesIcon,
  SettingsIcon,
} from "../../../components/icons.tsx";

const ITEMS = [
  { label: "Profiles", href: "/profiles", icon: ProfilesIcon },
  { label: "Proxies", href: "/proxies", icon: ProxiesIcon },
  { label: "MCP / API", href: "/connect", icon: ConnectIcon },
] as const;

export interface AppSideNavProps {
  onOpenSettings: () => void;
}

export function AppSideNav({ onOpenSettings }: AppSideNavProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <SideNav
      aria-label="Main navigation"
      collapsible
      header={
        <SideNavHeading
          heading="PP Browser"
          icon={<NavIcon icon={<LogoIcon width={16} height={16} />} />}
        />
      }
      footer={<SideNavItem label="Settings" icon={SettingsIcon} onClick={onOpenSettings} />}
    >
      <SideNavSection title="Manage" isHeaderHidden>
        {ITEMS.map((item) => (
          <SideNavItem
            key={item.href}
            label={item.label}
            href={item.href}
            icon={item.icon}
            isSelected={pathname === item.href || pathname.startsWith(`${item.href}/`)}
          />
        ))}
      </SideNavSection>
    </SideNav>
  );
}
