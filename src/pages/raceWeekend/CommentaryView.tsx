import type { ReactNode } from "react";

interface CommentaryViewProps {
  header: ReactNode;
  tabBar: ReactNode;
  statusBar: ReactNode;
  content: ReactNode;
}

export function CommentaryView({
  header,
  tabBar,
  statusBar,
  content,
}: Readonly<CommentaryViewProps>) {
  return (
    <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
      {header}
      {tabBar}
      {statusBar}
      <div className="flex flex-col md:flex-1 md:min-h-0 md:overflow-hidden">
        {content}
      </div>
    </div>
  );
}
