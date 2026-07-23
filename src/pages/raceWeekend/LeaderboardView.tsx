import type { ReactNode } from "react";

interface LeaderboardViewProps {
  header: ReactNode;
  loadingIndicator?: ReactNode;
  content: ReactNode;
}

export function LeaderboardView({
  header,
  loadingIndicator,
  content,
}: Readonly<LeaderboardViewProps>) {
  return (
    <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
      {header}
      {loadingIndicator}
      <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
        {content}
      </div>
    </div>
  );
}
