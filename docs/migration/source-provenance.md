# أصل الشيفرة وإنهاء أرشيف النقل

قرار المالك في Issue [#77](https://github.com/so7ob/web/issues/77) ينهي الحاجة إلى مصدر تاريخي لتطوير web أو تشغيله أو فحصه. حُذف `reference/` من الشجرة الحالية دون إعادة أرشفته أو إعادة كتابة Git. لا تُنشئ `archive/` أو `legacy/` أو ZIP بديلًا عنه.

- المصدر الأصلي: [so7ob/Website](https://github.com/so7ob/Website)، SHA `5321b7fd11db421c83290b262f276811e5f04e5f`؛ المقارنة النهائية `dddf8cd00a19cf7d562f503549f4c000109057d1`.
- المرجع المعماري المقروء فقط: [so7ob/Rakim](https://github.com/so7ob/Rakim)، SHA `cae0950bac45d97971bd3766c8c34f9869a856af`.
- آخر شجرة web قبل الإزالة: `2a6c37b9c7bcd21cc690119da1ac523c4451748a` (main)، وتطابق develop عند `aea8624`. [الأرشيف السابق](https://github.com/so7ob/web/tree/2a6c37b9c7bcd21cc690119da1ac523c4451748a/reference)، [جرد الاستيراد](https://github.com/so7ob/web/blob/2a6c37b9c7bcd21cc690119da1ac523c4451748a/docs/migration/import-manifest.json)، [التطبيع](https://github.com/so7ob/web/blob/2a6c37b9c7bcd21cc690119da1ac523c4451748a/docs/migration/import-normalizations.json)، [خريطة العزل](https://github.com/so7ob/web/blob/2a6c37b9c7bcd21cc690119da1ac523c4451748a/docs/migration/reference-relocation.json) محفوظة في تاريخ Git فقط.
- [تدقيق Website القديم](https://github.com/so7ob/web/tree/2a6c37b9c7bcd21cc690119da1ac523c4451748a/docs/reports/2026-10-02) وصوره وتعليماته وفهارس refresh تخص مصدر Next/Prisma/Bun القديم؛ ليست إجراء تشغيل للمنتج الحالي. تحفظ سجلات نقل web و[القبول النهائي](final-code-parity.md) والأدلة المرتبطة به في `docs/migration/`.

هذا القرار لا يغير ملكية الشيفرة أو حقوق المصدر أو اسم سُحُب وشعارها، ولا يمنح ترخيصًا جديدًا. إشعارات الأطراف الثالثة تبقى في الحزم المقفلة، بما فيها OFL لخطوط IBM Plex المستخدمة عبر `@fontsource`. تبقى LICENSE وTHIRD_PARTY_NOTICES وOFL الخاصة بأدوات التطوير تحت `.agents/`؛ لم يُحذف إشعار ترخيص أثناء التنظيف.

العقود الصغيرة الاصطناعية المشتقة سابقًا من المصدر لها وظيفة اختبار حالية مستقلة؛ قائمة القراء والبصمات في [tests/fixtures/README.md](../../tests/fixtures/README.md). هي قيم متوقعة ثابتة وليست نسخة تطبيق سابقة. لا تُولد تلقائيًا من تنفيذ المنتج الحالي.

لا يحتاج التشغيل أو النسخ/الاستعادة أو استيراد بيانات المستخدم إلى clone أو checkout للمصدر: أداة `data:transfer` تقرأ لقطة SQLite وملفات تشغيل يقدمها المشغل صراحةً، وتحتوي web نفسها مخططي البيانات وعينات SQL الاصطناعية واختبارات النقل. بقاؤها يحمي إمكانية نقل البيانات القديمة؛ لا يعني تنفيذ نقل إنتاج.
