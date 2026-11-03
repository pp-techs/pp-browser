import { useRouter } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, MouseEvent, Ref } from "react";

type AppLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  to?: string;
  ref?: Ref<HTMLAnchorElement>;
};

/**
 * Link component for Astryx's `LinkProvider`: renders a real anchor (middle-click, copy link and
 * new-tab keep working) but routes plain left-clicks on in-app paths through TanStack Router.
 */
export function AppLink({ href, to, target, onClick, ...rest }: AppLinkProps) {
  const router = useRouter();
  const destination = href ?? to;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    const isInApp = destination?.startsWith("/") && !destination.startsWith("//");
    const isPlainClick =
      event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
    if (event.defaultPrevented || !destination || !isInApp || !isPlainClick || target === "_blank")
      return;
    event.preventDefault();
    router.history.push(destination);
  };

  return <a {...rest} href={destination} target={target} onClick={handleClick} />;
}
