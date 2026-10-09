import {assertMediaReferences} from "../files/media-usage.js";
import { PagePublicationService } from "./publication.js";
import type { DataSource, QueryRunner } from "typeorm";
import {
  can,
  isValidSlug,
  validateBlocks,
  validateContent,
  countNodes,
  parsePageSettings,
  hasUnpublishedChanges,
  type AuthUser,
  type Permission,
} from "@so7ob/contracts";
import type { Page as StoredPage } from "../database/models.js";
import { AuthFault, audit, newId, transaction } from "../auth/persistence.js";
import { insertRecord, lockOperation } from "../business/persistence.js";
import { sqliteLike } from "../business/requests.js";
const permit = (user: AuthUser, permission: Permission) => {
  if (!can(user, permission)) throw new AuthFault(403, "forbidden");
};
const parsedRoles = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
};
function checkedBlocks(raw: unknown) {
  const checked = validateBlocks(raw);
  if (!checked.ok)
    throw new AuthFault(400, "invalid_blocks", { error: checked.error });
  return checked.blocks;
}
/** Keep v0 stored representation while accepting normalized v1 from template application. */
function checkedDocument(raw: string) {
  if (raw.trimStart().startsWith("[")) {
    const blocks = checkedBlocks(raw);
    return { json: JSON.stringify(blocks), count: blocks.length };
  }
  const content = validateContent(raw);
  if (!content.ok) throw new AuthFault(400, "invalid_blocks", {error: content.error});
  return { json: content.json, count: content.tree.length };
}
export class PageAdministrationService {
  constructor(private readonly db: DataSource) {}
  private async locked(r: QueryRunner, id: string): Promise<StoredPage> {
    await lockOperation(r, "cms-pages");
    const [page]: StoredPage[] = await r.query(
      "SELECT * FROM Page WHERE id=? FOR UPDATE",
      [id],
    );
    if (!page) throw new AuthFault(404, "not_found");
    return page;
  }
  async list(actor: AuthUser, query: { q?: string; status?: string }) {
    permit(actor, "pages.view");
    const search = (query.q ?? "").trim().toLowerCase().slice(0, 80),
      values: unknown[] = [],
      where = ["1=1"];
    if (query.status) {
      where.push("p.status=?");
      values.push(query.status);
    }
    if (search) {
      const matches = ["p.titleAr", "p.titleEn", "p.slug"].map((field) =>
        sqliteLike(field, search),
      );
      where.push("(" + matches.map((m) => m.sql).join(" OR ") + ")");
      values.push(...matches.map((m) => m.value));
    }
    const rows: Array<
      Pick<
        StoredPage,
        | "id"
        | "slug"
        | "isHome"
        | "order"
        | "status"
        | "visibility"
        | "titleAr"
        | "titleEn"
        | "draftUpdatedAt"
        | "publishedAt"
        | "updatedAt"
        | "editorTouchedAt"
        | "sourceKey"
        | "draftRevision" | "publishedRevision" | "draftSettings" | "publishedSettings" | "scheduledPublishAt"
      > & { versionCount: string | number }
    > = await this.db.query(
      `SELECT p.id,p.slug,p.isHome,p.\`order\`,p.status,p.visibility,p.titleAr,p.titleEn,p.draftUpdatedAt,p.publishedAt,p.updatedAt,p.editorTouchedAt,p.sourceKey,p.draftRevision,p.publishedRevision,p.draftSettings,p.publishedSettings,p.scheduledPublishAt,(SELECT COUNT(*) FROM PageVersion v WHERE v.pageId=p.id) versionCount FROM Page p WHERE ${where.join(" AND ")} ORDER BY p.\`order\`,p.createdAt`,
      values,
    );
    return {
      ok: true,
      pages: rows.map((p) => ({
        ...p,
        isHome: !!p.isHome,
        versionCount: Number(p.versionCount),
        hasUnpublishedChanges: hasUnpublishedChanges(p),
      })),
    };
  }
  async detail(actor: AuthUser, id: string) {
    permit(actor, "pages.view");
    const [p]: Array<StoredPage & {draftUpdatedByName: string | null}> = await this.db.query(
      "SELECT p.*,u.name draftUpdatedByName FROM Page p LEFT JOIN User u ON u.id=p.draftUpdatedById WHERE p.id=?",
      [id],
    );
    if (!p) throw new AuthFault(404, "not_found");
    const rows = await this.db.query(
      "SELECT v.id,v.locale,v.version,v.authorId,v.note,v.createdAt,u.name authorName FROM PageVersion v LEFT JOIN User u ON u.id=v.authorId WHERE v.pageId=? ORDER BY v.createdAt DESC LIMIT 30",
      [id],
    );
    return {
      ok: true,
      page: {
        id: p.id,
        slug: p.slug,
        isHome: !!p.isHome,
        order: p.order,
        status: p.status,
        visibility: p.visibility,
        allowedRoles: parsedRoles(p.allowedRoles),
        titleAr: p.titleAr,
        titleEn: p.titleEn,
        seoTitleAr: p.seoTitleAr,
        seoTitleEn: p.seoTitleEn,
        seoDescAr: p.seoDescAr,
        seoDescEn: p.seoDescEn,
        draftBlocksAr: p.draftBlocksAr,
        draftBlocksEn: p.draftBlocksEn,
        publishedBlocksAr: p.publishedBlocksAr,
        publishedBlocksEn: p.publishedBlocksEn,
        draftUpdatedAt: p.draftUpdatedAt,
        draftUpdatedById: p.draftUpdatedById,
        draftUpdatedByName: p.draftUpdatedByName,
        draftRevision: p.draftRevision,
        publishedRevision: p.publishedRevision,
        draftSettings: parsePageSettings(p.draftSettings, p),
        draftSlug: parsePageSettings(p.draftSettings, p).slug,
        draftTitleAr: parsePageSettings(p.draftSettings, p).titleAr,
        draftTitleEn: parsePageSettings(p.draftSettings, p).titleEn,
        publishedSettings: p.publishedSettings ? parsePageSettings(p.publishedSettings, p) : null,
        scheduledPublishAt: p.scheduledPublishAt,
        scheduledRevision: p.scheduledRevision,
        hasUnpublishedChanges: hasUnpublishedChanges(p),
        publishedAt: p.publishedAt,
        sourceKey: p.sourceKey,
        editorTouchedAt: p.editorTouchedAt,
        versions: rows.map(
          (v: {
            id: string;
            locale: string;
            version: number;
            authorId: string | null;
            note: string | null;
            createdAt: Date;
            authorName: string | null;
          }) => {
            const { authorName, ...version } = v;
            return {
              ...version,
              author: v.authorId ? { name: authorName } : null,
            };
          },
        ),
      },
    };
  }
  async create(actor: AuthUser, body: Record<string, unknown>) {
    permit(actor, "pages.edit");
    const slug = String(body.slug ?? "")
        .toLowerCase()
        .trim(),
      titleAr = String(body.titleAr ?? "")
        .trim()
        .slice(0, 200),
      titleEn = String(body.titleEn ?? "")
        .trim()
        .slice(0, 200);
    if (!isValidSlug(slug)) throw new AuthFault(400, "invalid_slug");
    if (!titleAr && !titleEn) throw new AuthFault(400, "invalid_title");
    return transaction(this.db, async (r) => {
      await lockOperation(r, "cms-pages");
      if ((await r.query("SELECT id FROM Page WHERE slug=?", [slug])).length)
        throw new AuthFault(409, "slug_taken");
      let blocksAr = "[]",
        blocksEn = "[]";
      if (body.template === "blank-section") {
        const stamp = Date.now().toString(36),
          make = (title: string) =>
            JSON.stringify([
              {
                id: "b-ph-" + stamp,
                type: "pageHeader",
                props: { kicker: title, title, intro: [], quickLinks: [] },
              },
              {
                id: "b-rt-" + stamp,
                type: "richText",
                props: { paragraphs: [title], align: "start" },
              },
            ]);
        blocksAr = make(titleAr || titleEn);
        blocksEn = make(titleEn || titleAr);
      }
      blocksAr = JSON.stringify(checkedBlocks(blocksAr));
      blocksEn = JSON.stringify(checkedBlocks(blocksEn));
      const [max] = await r.query("SELECT MAX(`order`) n FROM Page"),
        id = newId(),
        now = new Date();
      await insertRecord(r, "Page", {
        id,
        slug,
        titleAr: titleAr || titleEn,
        titleEn: titleEn || titleAr,
        status: "draft",
        order: Number(max.n ?? 0) + 1,
        draftBlocksAr: blocksAr,
        draftBlocksEn: blocksEn,
        draftUpdatedAt: now,
        editorTouchedAt: now,
        seoTitleAr: titleAr || titleEn,
        seoTitleEn: titleEn || titleAr,
      });
      await audit(
        r,
        "page.created",
        actor,
        { slug, template: String(body.template ?? "empty") },
        "page",
        id,
      );
      return { ok: true, page: { id, slug } };
    });
  }
  async update(actor: AuthUser, id: string, body: Record<string, unknown>) {
    permit(actor, "pages.edit");
    if (body.draftSettings !== undefined || (typeof body.baseRevision === "number" && [body.draftBlocksAr, body.draftBlocksEn].some(value => typeof value === "string"))) return new PagePublicationService(this.db).save(actor, id, body);
    return transaction(this.db, async (r) => {
      const page = await this.locked(r, id),
        updates: Record<string, unknown> = {};
      const writesTree = [body.draftBlocksAr, body.draftBlocksEn].some(value => typeof value === "string" && value.trimStart().startsWith("{"));
      if (writesTree || body.baseRevision !== undefined) {
        if (typeof body.baseRevision !== "number" || !Number.isInteger(body.baseRevision)) throw new AuthFault(409, "revision_required");
        if (body.baseRevision !== page.draftRevision) throw new AuthFault(409, "conflict", {serverRevision: page.draftRevision});
      }
      if (typeof body.draftUpdatedAt === "string" && page.draftUpdatedAt) {
        const stamp = new Date(body.draftUpdatedAt).getTime();
        if (!Number.isFinite(stamp)) throw new AuthFault(400, "invalid");
        // The client echoes our timestamp; exact monotonic compare closes the source's 1.5s lost-update window.
        if (stamp !== page.draftUpdatedAt.getTime())
          throw new AuthFault(409, "conflict", {
            serverDraftUpdatedAt: page.draftUpdatedAt,
          });
      }
      for (const key of ["draftBlocksAr", "draftBlocksEn"] as const)
        if (typeof body[key] === "string") {
          updates[key] = checkedDocument(body[key]).json;
        }
      if (Object.keys(updates).length) {
        updates.draftUpdatedAt = new Date(
          Math.max(Date.now(), (page.draftUpdatedAt?.getTime() ?? 0) + 1),
        );
        updates.draftUpdatedById = actor.id;
        updates.draftRevision = page.draftRevision + 1;
        updates.editorTouchedAt = new Date();
      }
      for (const key of ["titleAr", "titleEn"])
        if (typeof body[key] === "string")
          updates[key] = body[key].slice(0, 200);
      for (const key of ["seoTitleAr", "seoTitleEn", "seoDescAr", "seoDescEn"])
        if (typeof body[key] === "string")
          updates[key] =
            body[key].slice(0, key.startsWith("seoDesc") ? 500 : 300) || null;
      if (typeof body.order === "number" && Number.isFinite(body.order))
        updates.order = Math.max(-1, Math.min(999, Math.trunc(body.order)));
      if (
        typeof body.visibility === "string" &&
        ["public", "authenticated", "role"].includes(body.visibility)
      ) {
        updates.visibility = body.visibility;
        if (body.visibility === "role" && Array.isArray(body.allowedRoles))
          updates.allowedRoles = JSON.stringify(
            body.allowedRoles.map(String).slice(0, 10),
          );
      }
      if (typeof body.slug === "string" && body.slug !== page.slug) {
        const slug = body.slug.toLowerCase().trim();
        if (!isValidSlug(slug)) throw new AuthFault(400, "invalid_slug");
        if ((await r.query("SELECT id FROM Page WHERE slug=?", [slug])).length)
          throw new AuthFault(409, "slug_taken");
        if (
          (
            await r.query("SELECT id FROM PageRedirect WHERE fromSlug=?", [
              slug,
            ])
          ).length
        )
          throw new AuthFault(409, "redirect_loop");
        updates.slug = slug;
      }
      if (body.isHome === true && !page.isHome) {
        // A conflicting root slug must leave the old home intact, not partially clear it.
        if (
          (await r.query("SELECT id FROM Page WHERE slug='' AND id<>?", [id]))
            .length
        )
          throw new AuthFault(409, "slug_taken");
        await r.query(
          "UPDATE Page SET isHome=0,updatedAt=UTC_TIMESTAMP(3) WHERE isHome=1",
        );
        updates.isHome = true;
        updates.slug = "";
      }
      if (
        typeof updates.slug === "string" &&
        updates.slug !== page.slug &&
        page.slug !== "" &&
        page.status === "published"
      )
        await r.query(
          "INSERT INTO PageRedirect(id,fromSlug,toSlug) VALUES(?,?,?) ON DUPLICATE KEY UPDATE id=id",
          [newId(), page.slug, updates.slug],
        );
      if (!Object.keys(updates).length) throw new AuthFault(400, "invalid");
      await assertMediaReferences(r,updates);
      await r.query(
        `UPDATE Page SET ${Object.keys(updates)
          .map((k) => "`" + k + "`=?")
          .join(",")},updatedAt=UTC_TIMESTAMP(3) WHERE id=?`,
        [...Object.values(updates), id],
      );
      const [updated]: Array<{
        id: string;
        slug: string;
        draftUpdatedAt: Date | null;
        draftRevision: number;
        status: string;
      }> = await r.query(
        "SELECT id,slug,draftUpdatedAt,draftRevision,status FROM Page WHERE id=?",
        [id],
      );
      if (body.draftBlocksAr !== undefined || body.draftBlocksEn !== undefined)
        await audit(
          r,
          "page.draft_saved",
          actor,
          { slug: updated.slug },
          "page",
          id,
        );
      return { ok: true, page: updated };
    });
  }
  async archive(actor: AuthUser, id: string) {
    permit(actor, "pages.delete");
    return transaction(this.db, async (r) => {
      const page = await this.locked(r, id);
      if (page.isHome) throw new AuthFault(409, "is_home");
      await r.query(
        "UPDATE Page SET status='archived',updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
        [id],
      );
      await audit(r, "page.archived", actor, { slug: page.slug }, "page", id);
      return { ok: true };
    });
  }
  async publish(actor: AuthUser, id: string) {
    permit(actor, "pages.publish");
    return transaction(this.db, async (r) => {
      const p = await this.locked(r, id),
        ar = checkedDocument(p.draftBlocksAr),
        en = checkedDocument(p.draftBlocksEn);
      if (!ar.count && !en.count) throw new AuthFault(400, "empty_page");
      await assertMediaReferences(r,{blocksAr:ar.json,blocksEn:en.json});
      const maxima: Array<{ locale: string; n: number }> = await r.query(
        "SELECT locale,MAX(version) n FROM PageVersion WHERE pageId=? GROUP BY locale",
        [id],
      );
      const versions = {
          ar: (Number(maxima.find((v) => v.locale === "ar")?.n) || 0) + 1,
          en: (Number(maxima.find((v) => v.locale === "en")?.n) || 0) + 1,
        },
        now = new Date();
      await r.query(
        "UPDATE Page SET publishedBlocksAr=?,publishedBlocksEn=?,publishedAt=?,publishedById=?,status='published',updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
        [
          ar.count ? ar.json : null,
          en.count ? en.json : null,
          now,
          actor.id,
          id,
        ],
      );
      for (const locale of ["ar", "en"] as const)
        await insertRecord(r, "PageVersion", {
          id: newId(),
          pageId: id,
          locale,
          version: versions[locale],
          blocks: locale === "ar" ? ar.json : en.json,
          authorId: actor.id,
        });
      await audit(
        r,
        "page.published",
        actor,
        { slug: p.slug, versions },
        "page",
        id,
      );
      const recipients: Array<{ id: string }> = await r.query(
        "SELECT id FROM User WHERE status='active' AND roleKey IN ('super_admin','content_editor','ops_manager') AND id<>?",
        [actor.id],
      );
      if (recipients.length)
        await r.query(
          "INSERT INTO Notification(id,userId,type,payload,link) VALUES " +
            recipients.map(() => "(?,?,?,?,?)").join(","),
          recipients.flatMap((recipient) => [
            newId(),
            recipient.id,
            "content_published",
            JSON.stringify({ slug: p.slug || "home", title: p.titleAr }),
            "/ar/admin/pages",
          ]),
        );
      return { ok: true, publishedAt: now };
    });
  }
  async versions(actor: AuthUser, id: string) {
    permit(actor, "pages.view");
    const rows = await this.db.query(
      "SELECT v.id,v.locale,v.version,v.note,v.createdAt,v.blocks,u.name author FROM PageVersion v LEFT JOIN User u ON u.id=v.authorId WHERE v.pageId=? ORDER BY v.version DESC",
      [id],
    );
    return {
      ok: true,
      versions: rows.map(
        (v: {
          id: string;
          locale: string;
          version: number;
          note: string | null;
          createdAt: Date;
          blocks: string;
          author: string | null;
        }) => {
          const { blocks, ...safe } = v;
          let blockCount = 0;
          try {
            const value = JSON.parse(blocks);
            if (Array.isArray(value)) blockCount = value.length;
            else { const content = validateContent(blocks); if (content.ok) blockCount = countNodes(content.tree); }
          } catch {
            /* Source count fallback for historical malformed versions. */
          }
          return { ...safe, author: v.author ?? "—", blockCount };
        },
      ),
    };
  }
  async restore(actor: AuthUser, id: string, rawVersion: string) {
    permit(actor, "pages.restore");
    const version = Number(rawVersion);
    if (!Number.isInteger(version) || version < 1)
      throw new AuthFault(400, "invalid");
    return transaction(this.db, async (r) => {
      const page = await this.locked(r, id),
        versions: Array<{ locale: string; blocks: string }> = await r.query(
          "SELECT locale,blocks FROM PageVersion WHERE pageId=? AND version=? ORDER BY createdAt DESC",
          [id, version],
        );
      const ar =
          versions.find((v) => v.locale === "ar")?.blocks ?? page.draftBlocksAr,
        en =
          versions.find((v) => v.locale === "en")?.blocks ?? page.draftBlocksEn;
      await assertMediaReferences(r,{blocksAr:ar,blocksEn:en});
      // Source restores available locales and keeps a missing locale's current draft, without publishing.
      await r.query(
        "UPDATE Page SET draftBlocksAr=?,draftBlocksEn=?,draftRevision=draftRevision+1,draftUpdatedAt=?,draftUpdatedById=?,editorTouchedAt=UTC_TIMESTAMP(3),updatedAt=UTC_TIMESTAMP(3) WHERE id=?",
        [
          checkedDocument(ar).json,
          checkedDocument(en).json,
          new Date(
            Math.max(Date.now(), (page.draftUpdatedAt?.getTime() ?? 0) + 1),
          ),
          actor.id,
          id,
        ],
      );
      await audit(
        r,
        "page.version_restored",
        actor,
        { version, slug: page.slug },
        "page",
        id,
      );
      return { ok: true, restoredVersion: version };
    });
  }
}
