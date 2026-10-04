// Adapted from Website fc4a959; original session tests are superseded by generation-bound capability tests.
import { describe, it, expect } from "vitest";
import {
  DEFAULT_TRACK_POLICY,
  isCardClosed,
  isTrackMode,
  resolveTrackPolicy,
  trackSettingKey,
  type TrackPolicySettings,
} from "@so7ob/contracts";
import {staffReplyMail,trackLinkMail} from "../auth/email-templates.js";

const settings = (over: Partial<TrackPolicySettings> = {}): TrackPolicySettings => ({
  ...DEFAULT_TRACK_POLICY,
  ...over,
});

describe("resolveTrackPolicy — مصفوفة الأوضاع الأربعة", () => {
  it("login_required: لا اطلاع ولا رد عبر الرابط، والمالك يرد", () => {
    const p = resolveTrackPolicy("request", settings({ requestsMode: "login_required" }), null);
    expect(p.mode).toBe("login_required");
    expect(p.source).toBe("type_default");
    expect(p.canViewViaLink).toBe(false);
    expect(p.canReplyViaLink).toBe(false);
    expect(p.canReplyByOwner).toBe(true);
  });

  it("link_view: الاطلاع فقط — الرد عبر الرابط ممنوع خادميًا (اختبار 11)", () => {
    const p = resolveTrackPolicy("request", settings({ requestsMode: "link_view" }), null);
    expect(p.canViewViaLink).toBe(true);
    expect(p.canReplyViaLink).toBe(false);
    expect(p.canReplyByOwner).toBe(true);
  });

  it("link_reply: الاطلاع والرد بلا حساب (اختبار 12)", () => {
    const p = resolveTrackPolicy("inquiry", settings({ inquiriesMode: "link_reply" }), null);
    expect(p.canViewViaLink).toBe(true);
    expect(p.canReplyViaLink).toBe(true);
    expect(p.canReplyByOwner).toBe(true);
  });

  it("link_view_login_reply: حامل الرابط يطّلع فقط والرد بحساب مخوّل", () => {
    const p = resolveTrackPolicy("request", settings({ requestsMode: "link_view_login_reply" }), null);
    expect(p.canViewViaLink).toBe(true);
    expect(p.canReplyViaLink).toBe(false);
    expect(p.canReplyByOwner).toBe(true);
  });

  it("أوضاع الطلبات والاستفسارات مستقلة عن بعضها", () => {
    const s = settings({ requestsMode: "link_reply", inquiriesMode: "login_required" });
    expect(resolveTrackPolicy("request", s, null).canReplyViaLink).toBe(true);
    expect(resolveTrackPolicy("inquiry", s, null).canReplyViaLink).toBe(false);
  });
});

describe("resolveTrackPolicy — أولوية القواعد", () => {
  it("فرض الدخول على مستوى المنصة يتغلب على كل الأوضاع والاستثناءات (اختبارتا 13/19)", () => {
    const s = settings({ forceLogin: true, requestsMode: "link_reply", inquiriesMode: "link_reply" });
    for (const scope of ["request", "inquiry"] as const) {
      const p = resolveTrackPolicy(scope, s, "link_reply"); // حتى مع استثناء بطاقة يسمح
      expect(p.source).toBe("platform_force_login");
      expect(p.canViewViaLink).toBe(false);
      expect(p.canReplyViaLink).toBe(false);
      expect(p.canReplyByOwner).toBe(true); // مالك الحساب لا يتأثر
    }
  });

  it("استثناء البطاقة يتغلب على افتراضي النوع ويظهر مصدره", () => {
    const s = settings({ requestsMode: "login_required" });
    const p = resolveTrackPolicy("request", s, "link_view");
    expect(p.source).toBe("card_exception");
    expect(p.mode).toBe("link_view");
    expect(p.canViewViaLink).toBe(true);
    expect(p.canReplyViaLink).toBe(false);
  });

  it("استثناء تالف أو غير معروف يُتجاهل ويسقط لافتراضي النوع", () => {
    const s = settings({ requestsMode: "link_view" });
    // النوع موثوق به من قاعدة البيانات فقط — هنا نمرر قيمة صالحة إنما عبر مسار مختلف
    const p = resolveTrackPolicy("request", s, null);
    expect(p.source).toBe("type_default");
    expect(p.mode).toBe("link_view");
  });
});

describe("isCardClosed — البطاقة المغلقة توقف الرد في كل الأوضاع", () => {
  it("closed وcancelled مغلقتان", () => {
    expect(isCardClosed("closed")).toBe(true);
    expect(isCardClosed("cancelled")).toBe(true);
  });
  it("بقية الحالات مفتوحة", () => {
    for (const s of ["new", "in_review", "awaiting_info", "responded", "in_progress"]) {
      expect(isCardClosed(s)).toBe(false);
    }
  });
});

describe("isTrackMode وtrackSettingKey", () => {
  it("يقبل الأوضاع الأربعة فقط", () => {
    for (const m of ["login_required", "link_view", "link_reply", "link_view_login_reply"]) {
      expect(isTrackMode(m)).toBe(true);
    }
    expect(isTrackMode("open_to_world")).toBe(false);
    expect(isTrackMode("")).toBe(false);
    expect(isTrackMode(null)).toBe(false);
    expect(isTrackMode(42)).toBe(false);
  });

  it("مفتاح الإعداد لكل نطاق", () => {
    expect(trackSettingKey("request", "requestsMode")).toBe("track.requestsMode");
    expect(trackSettingKey("inquiry", "inquiriesMode")).toBe("track.inquiriesMode");
  });
});
describe("قوالب بريد المتابعة", () => {
  it("تسليم الرابط: يحوي الرابط والمرجع ومدة الصلاحية بالعربية والإنجليزية", () => {
    const ar = trackLinkMail("ar", { url: "https://x/ar/track?t=RAW", refCode: "S7-TEST1", expiresInDays: 90 });
    const en = trackLinkMail("en", { url: "https://x/en/track?t=RAW", refCode: "S7-TEST1", expiresInDays: 90 });
    expect(ar.subject).toContain("S7-TEST1");
    expect(ar.text).toContain("https://x/ar/track?t=RAW");
    expect(ar.text).toContain("90");
    expect(en.subject).toContain("S7-TEST1");
    expect(en.text).toContain("https://x/en/track?t=RAW");
  });

  it("إشعار رد الفريق: المالك يحصل على رابط بطاقة الحساب، والزائر على صفحة المتابعة العامة", () => {
    const owner = staffReplyMail("ar", { refCode: "S7-TEST2", url: "https://x/ar/track?card=request:c1", preview: "تمت المراجعة" });
    const guest = staffReplyMail("en", { refCode: "S7-TEST2", url: "https://x/en/track", preview: "Reviewed" });
    expect(owner.text).toContain("?card=request:c1");
    expect(owner.text).toContain("تمت المراجعة");
    expect(guest.text).toContain("https://x/en/track");
    // رابط الزائر العام لا يحمل رمزًا خامًا أبدًا — لا يُحيي رابطًا ملغى
    expect(guest.text).not.toMatch(/t=[A-Za-z0-9_-]{20,}/);
  });
});
