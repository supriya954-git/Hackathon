import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { IS_MOCK } from "@/services/api";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="mt-14 border-t-4 border-primary bg-navy text-navy-foreground">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 sm:py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="text-lg font-extrabold tracking-wide">JalRakshak</p>
          <p className="mt-2 max-w-md text-sm opacity-80">{t("footer.disclaimer")}</p>
          <p className="mt-3 text-xs opacity-70">{IS_MOCK ? t("footer.dataDemo") : t("footer.dataBackend")}</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t("nav.sources")}</p>
          <ul className="space-y-2 text-sm text-navy-foreground/80">
            <li><a className="hover:underline" href="https://www.dhm.gov.np/" target="_blank" rel="noreferrer">Dept. of Hydrology & Meteorology</a></li>
            <li><a className="hover:underline" href="https://ndrrma.gov.np/np/" target="_blank" rel="noreferrer">NDRRMA Nepal</a></li>
            <li><a className="hover:underline" href="https://bipadportal.gov.np/" target="_blank" rel="noreferrer">BIPAD Portal</a></li>
            <li>{t("footer.police")}</li>
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t("nav.project")}</p>
          <ul className="space-y-2 text-sm text-navy-foreground/80">
            <li><Link className="hover:underline" to="/about">{t("nav.about")}</Link></li>
            <li><Link className="hover:underline" to="/preparedness">{t("nav.preparedness")}</Link></li>
            <li><Link className="hover:underline" to="/track">{t("nav.track")}</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
