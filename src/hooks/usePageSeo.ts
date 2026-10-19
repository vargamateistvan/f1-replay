import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  applySeo,
  normalizePath,
  resolveRoute,
  type PageSeo,
} from "@/components/Seo/seo";

/**
 * Overrides the route defaults once a page knows what it shows (e.g. a driver
 * profile after standings load). Pass null while loading. Runs after RouteSeo,
 * which is mounted before the routes.
 */
export function usePageSeo(seo: PageSeo | null) {
  const location = useLocation();
  const title = seo?.title;
  const description = seo?.description;
  const canonicalPath = seo?.canonicalPath;
  const breadcrumb = seo?.breadcrumb;

  useEffect(() => {
    if (!title || !description) return;
    const pathname = normalizePath(location.pathname || "/");
    const base = resolveRoute(pathname);
    applySeo(pathname, {
      ...base,
      title,
      description,
      canonicalPath: canonicalPath ?? base.canonicalPath,
      breadcrumb: breadcrumb ?? base.breadcrumb,
    });
  }, [location.pathname, title, description, canonicalPath, breadcrumb]);
}
