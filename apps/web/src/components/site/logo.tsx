import { PRESENTATION_DEFAULTS } from "@so7ob/contracts";
import { useSitePresentation } from "@/components/appearance/provider";
/** Explicit light variant is for permanently dark surfaces such as the footer. */
export function Logo({
  variant = "dark",
  size = "md",
  showName = true,
  nameLang = "ar",
}: {
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  nameLang?: "ar" | "en";
}) {
  const s = useSitePresentation(),
    lang = nameLang === "ar" ? "Ar" : "En";
  const name =
    s["site.name" + lang] || PRESENTATION_DEFAULTS["site.name" + lang];
  const secondary =
    s[nameLang === "ar" ? "site.nameEn" : "site.nameAr"] ||
    PRESENTATION_DEFAULTS[nameLang === "ar" ? "site.nameEn" : "site.nameAr"];
  const displayName = showName && s["identity.showName"] !== "false";
  const dims = { sm: "h-8", md: "h-10", lg: "h-12" }[size];
  const light = s["identity.logo" + lang + "Light"] || "/logo.png",
    dark = s["identity.logo" + lang + "Dark"] || "/logo-white.png";
  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-2.5"
      aria-label={!displayName ? name : undefined}
      role={!displayName ? "img" : undefined}
    >
      {variant === "light" ? (
        <img
          src={dark}
          alt=""
          className={`${dims} max-w-32 w-auto object-contain`}
          width={40}
          height={40}
        />
      ) : (
        <>
          <img
            src={light}
            alt=""
            className={`${dims} logo-for-light max-w-32 w-auto object-contain`}
            width={40}
            height={40}
          />
          <img
            src={dark}
            alt=""
            className={`${dims} logo-for-dark max-w-32 w-auto object-contain`}
            width={40}
            height={40}
          />
        </>
      )}
      {displayName && (
        <span className="flex min-w-0 max-w-40 flex-col leading-tight sm:max-w-64">
          <span
            className={`truncate text-lg font-bold ${variant === "light" ? "text-inverse-foreground" : "text-foreground"}`}
          >
            {name}
          </span>
          <span
            className={`truncate text-xs ${variant === "light" ? "text-emphasis-muted" : "text-muted-foreground"}`}
          >
            {secondary}
          </span>
        </span>
      )}
    </span>
  );
}
