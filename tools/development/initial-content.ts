// Website initial public content, SHA 5321b7fd11db421c83290b262f276811e5f04e5f.
// No fixture accounts or private data; original sections and translations.
import { ar } from "../../apps/web/src/content/ar.js";
import { en } from "../../apps/web/src/content/en.js";
import type { Block } from "@so7ob/contracts";
let idCounter = 0;
function bid(prefix: string): string {
  idCounter += 1;
  return `b-${prefix}-${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function block(type: Block["type"], props: Record<string, unknown>): Block {
  return { id: bid(type), type, props };
}

/** يبني كتل الصفحات من المحتوى الثابت — نفس الأقسام والترتيب الحالي */
export function pageBlocks(key: string, locale: "ar" | "en"): Block[] {
  const c = locale === "en" ? en : ar;
  const blocks: Block[] = [];

  if (key === "home") {
    blocks.push(
      block("hero", {
        kicker: c.home.hero.kicker,
        title: c.home.hero.title,
        titleAccent: c.home.hero.titleAccent,
        description: c.home.hero.description,
        support: c.home.hero.support,
      }),
      block("servicesGrid", {
        kicker: c.home.services.kicker,
        title: c.home.services.title,
        description: c.home.services.description,
        cards: c.home.services.cards,
        items: c.services.items,
      }),
      block("featureGrid", {
        kicker: c.home.why.kicker,
        title: c.home.why.title,
        items: c.home.why.items,
        columns: "3",
      }),
      block("worksShowcase", {
        kicker: c.home.works.kicker,
        title: c.home.works.title,
        description: c.home.works.description,
        cases: c.home.works.cases,
        disclaimer: c.works.disclaimer.title,
      }),
      block("processSteps", {
        kicker: c.home.process.kicker,
        title: c.home.process.title,
        steps: c.home.process.steps,
      }),
      block("faqSection", {
        kicker: c.home.faq.kicker,
        title: c.home.faq.title,
        description: c.faq.intro,
        items: c.home.faq.selected.map((i) => c.faq.items[i]).filter(Boolean),
        ctaLabel: c.actions.viewAllFaq,
        ctaHref: "/faq",
      }),
      block("ctaSection", {
        title: c.home.finalCta.title,
        body: c.home.finalCta.body,
        discussNote: c.home.finalCta.discussNote,
        quoteNote: c.home.finalCta.quoteNote,
        links: [
          {
            label: c.actions.discuss,
            href: "/contact?type=discussion",
            variant: "primary",
          },
          {
            label: c.actions.quote,
            href: "/contact?type=quote",
            variant: "outline",
          },
        ],
      }),
    );
  }

  if (key === "about") {
    blocks.push(
      block("pageHeader", {
        kicker: c.about.kicker,
        title: c.about.title,
        intro: c.about.intro,
      }),
      block("visionMission", {
        vision: c.about.vision,
        mission: c.about.mission,
      }),
      block("numberedValues", {
        title: c.about.valuesTitle,
        intro: c.about.valuesIntro,
        items: c.about.values,
        closingNote: c.about.honesty,
      }),
      block("numberedList", {
        title: c.about.principlesTitle,
        items: c.about.principles,
      }),
      block("navCtaBanner", {
        label: c.services.title,
        links: [
          { label: c.nav.services, href: "/services", variant: "primary" },
          { label: c.nav.process, href: "/process", variant: "outline" },
        ],
      }),
    );
  }

  if (key === "services") {
    blocks.push(
      block("pageHeader", {
        kicker: c.services.kicker,
        title: c.services.title,
        intro: [c.services.intro],
        quickLinks: c.services.items.map((i) => ({
          label: i.name,
          href: `#${i.service}`,
        })),
      }),
      block("servicesDetail", {
        items: c.services.items,
        labels: c.services.labels,
        requestLabel: c.actions.requestService,
      }),
    );
  }

  if (key === "works") {
    blocks.push(
      block("pageHeader", {
        kicker: c.works.kicker,
        title: c.works.title,
        intro: [c.works.intro],
      }),
      block("worksFull", {
        disclaimer: c.works.disclaimer,
        labels: c.works.labels,
        statuses: c.works.statuses,
        cases: c.works.cases,
        interactiveNote: c.works.interactiveNote,
        flowNote: c.works.flowNote,
      }),
    );
  }

  if (key === "process") {
    blocks.push(
      block("pageHeader", {
        kicker: c.process.kicker,
        title: c.process.title,
        intro: [c.process.intro],
      }),
      block("processFull", {
        labels: c.process.labels,
        phases: c.process.phases,
        changes: c.process.changes,
      }),
    );
  }

  if (key === "faq") {
    blocks.push(
      block("pageHeader", {
        kicker: c.faq.kicker,
        title: c.faq.title,
        intro: [c.faq.intro],
      }),
      block("faqSection", {
        kicker: c.faq.kicker,
        title: c.faq.title,
        items: c.faq.items,
        ctaLabel: c.nav.contact,
        ctaHref: "/contact",
      }),
    );
  }

  if (key === "contact") {
    blocks.push(
      block("pageHeader", {
        kicker: c.contact.kicker,
        title: c.contact.title,
        intro: [c.contact.description],
      }),
      block("requestForm", { showPrivacy: true, showNextSteps: true }),
    );
  }

  return blocks;
}

export const INITIAL_PAGES: { key: string; slug: string; order: number }[] = [
  { key: "home", slug: "", order: -1 },
  { key: "about", slug: "about", order: 0 },
  { key: "services", slug: "services", order: 1 },
  { key: "works", slug: "works", order: 2 },
  { key: "process", slug: "process", order: 3 },
  { key: "faq", slug: "faq", order: 4 },
  { key: "contact", slug: "contact", order: 5 },
];
