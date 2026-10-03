import { createDataSource } from "../../packages/server/src/database/data-source.js";
import {
  transaction,
  newId,
} from "../../packages/server/src/auth/persistence.js";
import {
  insertRecord,
  lockOperation,
} from "../../packages/server/src/business/persistence.js";
import { validateBlocks } from "@so7ob/contracts";
import { ar } from "../../apps/web/src/content/ar.js";
import { en } from "../../apps/web/src/content/en.js";
import { siteConfig } from "../../apps/web/src/config/site.js";
import { INITIAL_PAGES, pageBlocks } from "./initial-content.js";
const target = process.argv.find((a) => a.startsWith("--database="))?.slice(11);
if (
  process.env.NODE_ENV !== "development" ||
  !["127.0.0.1", "localhost"].includes(process.env.DATABASE_HOST ?? "") ||
  !target ||
  target !== process.env.DATABASE_NAME ||
  !process.argv.includes("--confirm-empty")
)
  throw new Error(
    "Explicit local development database and --confirm-empty required; production initialization is forbidden",
  );
const db = await createDataSource().initialize();
try {
  await transaction(db, async (r) => {
    await lockOperation(r, "development-site-initialization");
    for (const table of ["Page", "PageVersion", "MenuItem", "SiteSetting"])
      if (
        Number(
          (await r.query("SELECT COUNT(*) n FROM `" + table + "`"))[0].n,
        ) !== 0
      )
        throw new Error(
          "Site is not completely empty; existing content must be preserved. No reset/update is performed.",
        );
    const now = new Date();
    for (const def of INITIAL_PAGES) {
      const blocksAr = JSON.stringify(pageBlocks(def.key, "ar")),
        blocksEn = JSON.stringify(pageBlocks(def.key, "en"));
      if (!validateBlocks(blocksAr).ok || !validateBlocks(blocksEn).ok)
        throw new Error("Invalid original content blocks");
      const key = def.key as keyof typeof ar.meta.pages;
      await insertRecord(r, "Page", {
        id: newId(),
        slug: def.slug,
        sourceKey: def.key,
        seedVersion: 1,
        isHome: def.key === "home",
        order: def.order,
        status: "published",
        titleAr:
          def.key === "home"
            ? ar.meta.siteName
            : ar.nav[def.key as keyof typeof ar.nav],
        titleEn:
          def.key === "home"
            ? en.meta.siteName
            : en.nav[def.key as keyof typeof en.nav],
        seoTitleAr: ar.meta.pages[key].title,
        seoTitleEn: en.meta.pages[key].title,
        seoDescAr: ar.meta.pages[key].description,
        seoDescEn: en.meta.pages[key].description,
        draftBlocksAr: blocksAr,
        draftBlocksEn: blocksEn,
        publishedBlocksAr: blocksAr,
        publishedBlocksEn: blocksEn,
        draftUpdatedAt: now,
        publishedAt: now,
      });
    }
    for (const location of ["header", "footer"])
      for (const [order, def] of INITIAL_PAGES.filter(
        (d) => d.key !== "home",
      ).entries())
        await insertRecord(r, "MenuItem", {
          id: newId(),
          location,
          labelAr: ar.nav[def.key as keyof typeof ar.nav],
          labelEn: en.nav[def.key as keyof typeof en.nav],
          pageSlug: def.slug,
          order,
          enabled: true,
        });
    for (const [key, value] of Object.entries({
      "contact.email": siteConfig.contact.email,
      "contact.phone": siteConfig.contact.phone,
      "contact.address": siteConfig.contact.address,
      "social.github": siteConfig.github,
      "site.nameAr": siteConfig.nameAr,
      "site.nameEn": siteConfig.nameEn,
    }))
      await insertRecord(r, "SiteSetting", { key, value });
  });
  console.log(
    "Initialized 7 original bilingual public pages, 12 menu links and 6 settings in the explicitly selected empty local development database. No accounts or operational records were imported.",
  );
} finally {
  await db.destroy();
}
