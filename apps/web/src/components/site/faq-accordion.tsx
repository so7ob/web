"use client";

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

/**
 * أكورديون الأسئلة — مبني على Radix: قابل للوحة المفاتيح بالكامل
 * (أسهم للتنقل، Enter/Space للفتح)، بحالات aria-expanded واضحة.
 */
export function FaqAccordion({ items, selected }: { items: { q: string; a: string }[]; selected?: number[] }) {
  const list = selected ? selected.map((i) => items[i]).filter(Boolean) : items;

  return (
    <Accordion type="single" collapsible className="ds-card gap-0 overflow-hidden">
      {list.map((item) => (
        <AccordionItem
          key={item.q}
          value={item.q}
          className="overflow-hidden px-4"
        >
            <AccordionTrigger className="text-base font-normal">
              {item.q}
            </AccordionTrigger>
          <AccordionContent><p className="pt-3 text-base leading-7 text-muted-foreground">{item.a}</p></AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
