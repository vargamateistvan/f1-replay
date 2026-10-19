import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applySeo, normalizePath, resolveRoute } from "./seo";

export function RouteSeo() {
  const location = useLocation();

  useEffect(() => {
    const pathname = normalizePath(location.pathname || "/");
    applySeo(pathname, resolveRoute(pathname));
  }, [location.pathname]);

  return null;
}
