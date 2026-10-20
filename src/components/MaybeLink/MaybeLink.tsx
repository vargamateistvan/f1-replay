import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

interface Props {
  readonly to?: string;
  readonly className?: string;
  readonly title?: string;
  readonly style?: CSSProperties;
  readonly "aria-label"?: string;
  readonly children: ReactNode;
}

// A router link when `to` is given, otherwise a plain span — lets shared
// components link to profile pages without needing a router in every context.
export function MaybeLink({ to, children, ...rest }: Props) {
  if (!to) return <span {...rest}>{children}</span>;
  return (
    <Link to={to} {...rest}>
      {children}
    </Link>
  );
}
