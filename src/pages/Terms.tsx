import { Link } from "react-router-dom";
import { useSettings } from "@/stores/settings";
import { FALLBACK_LANGUAGE } from "@/i18n/language";
import { t } from "@/i18n/translations";

export default function Terms() {
  const updatedOn = "2026-06-20";
  const language = useSettings((s) => s.language ?? FALLBACK_LANGUAGE);

  return (
    <section className="relative flex h-full min-h-[55vh] flex-col overflow-hidden bg-track px-4 py-6 sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(232,0,45,0.16),_transparent_58%)]" />

      <div className="relative z-10 mx-auto w-full max-w-4xl rounded-2xl border border-panel bg-surface/80 p-5 shadow-[0_20px_55px_rgba(0,0,0,0.35)] sm:p-8">
        <p className="text-f1red text-[11px] font-mono uppercase tracking-[0.24em]">
          {t(language, "termsPage.legal")}
        </p>
        <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
          {t(language, "termsPage.title")}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {t(language, "termsPage.lastUpdated", { date: updatedOn })}
        </p>

        <div className="mt-6 space-y-5 text-sm leading-6 text-white/90">
          <p>{t(language, "termsPage.intro")}</p>

          <div>
            <h2 className="text-base font-bold text-white">
              {t(language, "termsPage.sections.use.title")}
            </h2>
            <p className="mt-2">{t(language, "termsPage.sections.use.body")}</p>
          </div>

          <div>
            <h2 className="text-base font-bold text-white">
              {t(language, "termsPage.sections.dataSources.title")}
            </h2>
            <p className="mt-2">
              {t(language, "termsPage.sections.dataSources.body")}
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-white">
              {t(language, "termsPage.sections.noWarranty.title")}
            </h2>
            <p className="mt-2">
              {t(language, "termsPage.sections.noWarranty.body")}
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-white">
              {t(language, "termsPage.sections.liability.title")}
            </h2>
            <p className="mt-2">
              {t(language, "termsPage.sections.liability.body")}
            </p>
          </div>

          <div>
            <h2 className="text-base font-bold text-white">
              {t(language, "termsPage.sections.contact.title")}
            </h2>
            <p className="mt-2">
              {t(language, "termsPage.sections.contact.body")}
            </p>
          </div>

          <p className="text-xs text-muted">
            {t(language, "termsPage.disclaimer")}
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            to="/privacy"
            className="rounded-md border border-panel bg-track px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:border-f1red hover:text-f1red"
          >
            {t(language, "termsPage.privacyLink")}
          </Link>
          <Link
            to="/"
            className="rounded-md bg-f1red px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-600"
          >
            {t(language, "termsPage.backToReplay")}
          </Link>
        </div>
      </div>
    </section>
  );
}
