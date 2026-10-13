import Link from "@/routing/link";
import { localePath } from "@/lib/i18n";

/**
 * صفحة 404 العامة — تُستخدم لكل المسارات غير المطابقة.
 * بما أن الموقع يعتمد جذر تخطيط لكل مجموعة مسارات، توفر هذه الصفحة
 * <html> و<body> بنفسها مع توجيه ثنائي اللغة.
 */
export function NotFound() {
  return (
    <div lang="ar" dir="rtl" style={{ margin: 0, background: "var(--background)", fontFamily: "var(--site-font, system-ui)" }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div style={{ maxWidth: "32rem", textAlign: "center" }}>
            <p style={{ fontFamily: "monospace", fontSize: "5rem", fontWeight: 700, color: "var(--foreground)", opacity: 0.12, margin: 0 }} aria-hidden="true">
              {"{ 404 }"}
            </p>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--foreground)", margin: "0.5rem 0 1rem" }}>
              الصفحة غير موجودة — Page not found
            </h1>
            <p style={{ color: "var(--muted-foreground)", lineHeight: 2, margin: "0 0 1.75rem" }}>
              الرابط الذي طلبته غير متاح أو تغيّر. يمكنك العودة إلى الموقع واختيار اللغة المناسبة.
              <br />
              The page you requested is unavailable or has moved.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href={localePath("ar")}
                style={{
                  background: "var(--primary)", color: "var(--primary-foreground)", borderRadius: "999px", padding: "0.7rem 1.6rem",
                  fontWeight: 600, textDecoration: "none", display: "inline-block",
                }}
                lang="ar"
              >
                العربية
              </Link>
              <Link
                href={localePath("en")}
                style={{
                  border: "2px solid var(--border)", color: "var(--foreground)", borderRadius: "999px", padding: "0.7rem 1.6rem",
                  fontWeight: 600, textDecoration: "none", display: "inline-block",
                }}
                lang="en"
              >
                English
              </Link>
            </div>
          </div>
        </main>
    </div>
  );
}
