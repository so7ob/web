# مصفوفة تحسينات أكتوبر — #41–#56

بدأ التنفيذ من حالة نظيفة: main `2a26ee0c19bec249ea394d5584028ddff599b6dc`،
develop `85ab40b8c7558f0590c684c4eb1031fbae678a66`، دون فرق ملفات بينهما أو Issues/PRs مفتوحة.
أعيد فحص كل ملاحظة مقابل الكود الحالي؛ قبول الوظائف الأخير هو المرجع، والتقارير القديمة محفوظة.
كل كتابة في so7ob/web. لم يتغير main/develop، ولم يحدث دمج PR أو إصدار أو نشر أو ترحيل إنتاج.

## الحزم وحدود القبول

المسارات مختصرة نسبة إلى الجذر. جميع PRs إلى develop ومفتوحة بلا دمج؛ نتيجة البوابات
المحدثة وSHA المرفوع مثبتة في وصف كل PR وفحصه، وليست عبارة «مفتوح» ادعاء اجتياز CI.

| الحزمة | الأولوية والتصنيف | أهم المسارات | معيار القبول | Issue / الفرع / PR | الحالة التشغيلية |
|---|---|---|---|---|---|
| قواعد المساهمة وCI | P1، عيب مؤكد بالقالب ونطاق الحدث | `.github/PULL_REQUEST_TEMPLATE.md`، `.github/workflows/ci.yml`، `contribution-gates-41.md` | أوامر npm، أحداث PR/push للفرعين، كل الفحوص باقية | [#41](https://github.com/so7ob/web/issues/41)، `fix/41-contribution-gates`، [#42](https://github.com/so7ob/web/pull/42) | حماية GitHub بانتظار المالك |
| صندوق البريد | P1، عيب مؤكد بعرض الحالات | `packages/contracts/src/outbox.ts`، `packages/server/src/admin/operations.ts`، `apps/web/src/components/admin/outbox/` | الحالات مترجمة؛ محاولات/موعد/رمز منقح دون حمولة أو إرسال مكرر | [#43](https://github.com/so7ob/web/issues/43)، `fix/43-outbox-status`، [#47](https://github.com/so7ob/web/pull/47) | PR مفتوح، بلا تغيير تشغيل الطابور |
| التصدير | P1، عيب مؤكد بالمرشح والاقتطاع والنجاح الوهمي | `packages/server/src/admin/conversations.ts`، `apps/api/src/admin/operations.controller.ts`، `apps/web/src/components/admin/download-csv.ts` | 5105 سجلات، نفس المرشحات، دفعات وحدود معلنة، أخطاء HTTP/الشبكة واضحة | [#44](https://github.com/so7ob/web/issues/44)، `fix/44-complete-csv-export`، [#48](https://github.com/so7ob/web/pull/48) | لا migration؛ تنظيف ملفات مؤقتة في staging |
| إتاحة البوابة | P1، أعيد إنتاجه حيًا ثم أصلح | `apps/web/src/components/account/`، `tests/e2e/account-portal.spec.ts`، `portal-tabs.spec.ts` | tab/tabpanel والتباين والتركيز، عربي/إنجليزي 375/1280 وaxe دون baseline هدف | [#45](https://github.com/so7ob/web/issues/45)، `fix/45-portal-accessibility`، [#49](https://github.com/so7ob/web/pull/49) | لا ادعاء امتثال شامل |
| تعارض القوائم والإعدادات | P1، مخاطرة ثبتت بمحررين | `admin/revisions.ts`، `admin/operations.ts`، migration `1791676800000`، واجهتا menus/settings | تحديث شرطي ذري؛409، حفظ المسودة ومراجعة/تحميل، حقول مستقلة | [#46](https://github.com/so7ob/web/issues/46)، `fix/46-admin-write-conflicts`، [#51](https://github.com/so7ob/web/pull/51) | مسارات API القديمة موثقة كغير محمية من الكتابة القديمة |
| حياة العامل والطوابير | P2، تحسين مقترح | `queue/monitor.ts`، `apps/worker/src/main.ts`، migration `1791676801000` | عامل متوقف/API200→degraded، قراءة مقيدة منقحة بلا تعديل الطابور | [#50](https://github.com/so7ob/web/issues/50)، `feat/50-worker-health`، [#53](https://github.com/so7ob/web/pull/53) | لا تنبيهات أو خدمة خارجية |
| سياسة مهل الرد | P2، تحسين مقترح | `admin/response-policy.ts`، `admin/dashboard.ts`، `admin/conversations.ts`، واجهتا settings/requests | افتراضي24، إقرار أثر التغيير، تاريخ خادم، قائمة/لوحة متسقتان وحدود زمنية | [#52](https://github.com/so7ob/web/issues/52)، `feat/52-response-deadlines`، [#55](https://github.com/so7ob/web/pull/55) | متراكب فوق #48 و#51؛ لا التزام خدمة تجاري |
| استعلام الإدارة وصيانة المحرر | P2، قياس أثبت موضع الاختناق | `admin/conversations.ts`، `editor/use-editor-navigation-guard.ts`، `tools/migration/conversation-list-benchmark.mjs` | 20×1000: صفوف20000→0/20، العدد محفوظ؛ قياس chunk/تحميل ورحلات المحرر | [#54](https://github.com/so7ob/web/issues/54)، `perf/54-conversation-summaries`، [#58](https://github.com/so7ob/web/pull/58) | متراكب فوق #55؛ لا وعد سعة غير مقاسة |
| دليل الجاهزية المستقلة | مستقل، حد تشغيل موثق | `docs/migration/independent-recovery-56.md` وهذه المصفوفة | دليل قاعدة/ملفات/مفاتيح/إصدار وطوابير وstaging، وRPO/RTO يحتاجان اعتمادًا | [#56](https://github.com/so7ob/web/issues/56)، `docs/56-independent-recovery`، [#57](https://github.com/so7ob/web/pull/57) | فقد المضيف غير متحقق |

## نتائج مثبتة وحدود نسبتها

`evidence/improvements-20261011/local-gates.json` يحفظ الأمر وSHA والنتيجة والمدة وبصمة السجل المحلي،
دون أسرار أو بيانات العملاء. نُقلت السجلات التالية كما حدثت، بما فيها الفشل، دون نسبتها إلى تعديل لاحق:

- #42 عند3b5a8f2: جميع البوابات المحلية،842 اختبارًا و138 رحلة متصفح؛ CI ناجح [38085014766](https://github.com/so7ob/web/actions/runs/38085014766).
- #47: البوابات المحلية عند0d7aa2e نجحت عدا e2e؛ كشف استهلاك حصة login من fixtures إضافية. أصلح f15e8d5 عزل fixture، واجتاز CI الكامل [38086975848](https://github.com/so7ob/web/actions/runs/38086975848).
- #48 عند6416c13: CI الكامل [38086656442](https://github.com/so7ob/web/actions/runs/38086656442) ناجح؛ الاختبارات المحلية تشمل5105 سجلات و8 رحلات تنزيل/رفض.
- #49 عند43dcca2: CI الكامل [38086720749](https://github.com/so7ob/web/actions/runs/38086720749) ناجح؛12 قياسًا قبل الإصلاح و10 رحلات محلية بعده.
- #51 عند5825b07:845 اختبارًا محليًا وكل البوابات غير المتصفح في السجل ناجحة؛ اختبار الواجهة المركز4 حالات نجح على سلفه6e9b044. عُزل عنصر القائمة الاصطناعي في5825b07 بعد أن رفض فحص النقل وجهة تلوثت من fixture؛ لم يتغير شرط الوجهة الفارغة.
- #53 عندf78720e: CI الكامل [38086884935](https://github.com/so7ob/web/actions/runs/38086884935) ناجح، وتجربة إيقاف عامل حقيقي مع API200 أثبتت degraded دون SMTP خارجي.
- #55:19 اختبارًا مركزًا و4 رحلات سياسة/axe محلية؛ ورث إصلاح تنظيف fixture من #51. النتيجة النهائية عند8c3e6c9 في PR.
- #58: القياس النهائي للكود عندc5811c6 محفوظ مع قياس قبله100f1c7 و17 اختبار MariaDB و4 رحلات محرر. دمج إصلاح fixture فقط أنتج5c394f2؛ بواباته الكاملة في PR.

بوابة CI تعني فحصَي **Imported reference checks (transitional runtime)** و**Target lint, TypeScript, MariaDB tests and SSR build**،
بما يشمل lint المستقل عنTypeScript، والوحدة/التكامل،build،worker/files/webhook/auth/CMS/restore،e2e،infra،independence وdiff.
فحص Bun المرجعي مثبت ولا يمثل تشغيل المنتج. نجاح CI لا يثبت نشرًا أو بيانات إنتاج.

## التوافق والتراجع وترتيب المراجعة

احتُفظ بالأطر والإصدارات المثبتة وSSR واللغتين والهوية والحدود والصلاحيات والجلسات وبcrypt والملفات وروابطها.
لا preview لحمولة البريد، ولا resend uncertain. CSV لا يعد بحفظ على القرص، بل جاهزية تنزيل متحقق.
عقود الكتابة القديمة في القوائم والإعدادات باقية دون ادعاء حمايتها؛ انقل العملاء الخارجيين صراحة إلى checked
قبل اقتراح إلغاء المسارات القديمة. تعطيل sessionStorage يحد حفظ مسودة التعارض بذاكرة الصفحة.

راجع الحزم المستقلة، ثم #48 و#51 قبل #55، و#55 قبل #58. الفروق الإضافية موضحة في أوصاف PRs؛
كل قواعدها develop. #51/#53 تضيفان migrations منفصلتين؛ راجع جمع التسجيل وترتيبه قبل بناء إصدار
يجمعهما، وأعد البوابات على ذلك الإصدار. لا يوجد إصدار مجمع أو merge ضمن هذه المهمة.

التراجع بالكود عبر PR مُراجع؛ احتفظ بجداول AdminRevision وWorkerHeartbeat ولا تستخدم down مدمّرًا.
التراجع عن إصلاحات العرض/التصدير/الإتاحة يعيد العيوب السابقة ويحتاج تقديرًا. سياسة الرد يمكن إعادتها إلى24
بإقرار صريح؛ تراجع الوثائق لا يغير الخدمات. بعد فتح كتابات في تشغيل مستقبلي لا تستبدل بيانات أحدث بنسخة قديمة.

تظل حماية الفرعين، واعتماد أهداف RPO/RTO وبيئة staging وتجربة فقد المضيف، وسياسة احتفاظ heartbeat
وتنظيف الملفات المؤقتة، أعمالًا تحتاج المالك/بيئة تشغيل. لم تُنفذ تلقائيًا.
