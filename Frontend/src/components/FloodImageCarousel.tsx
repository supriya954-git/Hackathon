import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

const IMAGE_ALTS = [
  "Flood resilience project photograph from Nepal, slide 1",
  "Flood resilience project photograph from Nepal, slide 2",
  "Flood resilience project photograph from Nepal, slide 3",
  "Flood resilience project photograph from Nepal, slide 4",
  "Flood resilience project photograph from Nepal, slide 5",
  "Flood resilience project photograph from Nepal, slide 6",
  "Flood resilience project photograph from Nepal, slide 7",
  "Flood resilience project photograph from Nepal, slide 8",
];
const IMAGES = IMAGE_ALTS.map((alt, index) => ({
  src: `/flood-images/flood-${index + 1}.jpeg`,
  alt,
}));

const INTERVAL_MS = 4500;

export function FloodImageCarousel({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    timer.current = window.setInterval(
      () => setCurrent((slide) => (slide + 1) % IMAGES.length),
      INTERVAL_MS,
    );
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
      timer.current = null;
    };
  }, [paused, reducedMotion]);

  const goTo = (index: number) => setCurrent((index + IMAGES.length) % IMAGES.length);
  const previous = () => goTo(current - 1);
  const next = () => goTo(current + 1);

  return (
    <section
      aria-label={t("carousel.label")}
      className="relative overflow-hidden rounded-lg border border-border/70 bg-navy shadow-md"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <div className="relative min-h-[31rem] sm:aspect-[16/7] sm:min-h-[31rem] lg:min-h-[34rem]">
        {IMAGES.map((image, index) => (
          <img
            key={image.src}
            src={image.src}
            alt={image.alt}
            className={`absolute inset-0 size-full object-cover transition-opacity duration-700 ${index === current ? "opacity-100" : "pointer-events-none opacity-0"}`}
            loading={index === 0 ? "eager" : "lazy"}
            aria-hidden={index !== current}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-[#102d36]/95 via-[#102d36]/75 to-[#102d36]/20" />
        {children && <div className="absolute inset-0 z-10 flex items-center">{children}</div>}
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 via-black/25 to-transparent px-4 pb-4 pt-16 sm:px-6">
          <p className="text-sm font-medium text-white">{t("carousel.caption")}</p>
          <span className="shrink-0 text-xs text-white/90">
            {current + 1} / {IMAGES.length}
          </span>
        </div>
        <button
          type="button"
          onClick={previous}
          aria-label={t("carousel.previous")}
          className="absolute left-3 top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-navy/75 text-white shadow-md transition-colors hover:bg-navy focus:outline-none focus:ring-2 focus:ring-white sm:left-5"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label={t("carousel.next")}
          className="absolute right-3 top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-navy/75 text-white shadow-md transition-colors hover:bg-navy focus:outline-none focus:ring-2 focus:ring-white sm:right-5"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div
        className="flex min-h-11 items-center justify-center gap-1.5 border-t border-border/70 bg-card px-4 py-2"
        role="tablist"
        aria-label={t("carousel.selectSlide")}
      >
        {IMAGES.map((image, index) => (
          <button
            key={image.src}
            type="button"
            role="tab"
            aria-selected={index === current}
            aria-label={`${t("carousel.slide")} ${index + 1}`}
            onClick={() => goTo(index)}
            className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <span className={`size-2.5 rounded-full transition-colors ${index === current ? "bg-primary" : "bg-muted-foreground/40 group-hover:bg-muted-foreground/70"}`} />
          </button>
        ))}
      </div>
    </section>
  );
}
