# تنظيف المستودع واستقلال web — #77

Issue: [#77](https://github.com/so7ob/web/issues/77). الفرع `refactor/77-repository-cleanup` من develop؛ لا اعتماد متراكم ولا دمج أو نشر تلقائي.

نقطة البداية: main `2a6c37b9c7bcd21cc690119da1ac523c4451748a`، وdevelop `aea86246105df492b6793f8aa0814f7a853d83b4` بالشجرة نفسها. كانت الشجرة نظيفة، ولا Issue أو PR مفتوح للنطاق. تحقق origin fetch/push وGitHub `nameWithOwner=so7ob/web` قبل كل كتابة بعيدة. لم تُلمس Website/Rakim أو فروع محمية أو إعدادات المستودع أو أعمال محلية سابقة.

## القرارات ودليل الاستخدام

| المسار / الوظيفة | المستهلكون والدليل | القرار | التحقق |
|---|---|---|---|
| `reference/`، `reference-relocation.json` | اختبار استقلال قديم يطابق 338 بصمة؛ CI يختبر commit أرشيفًا | حذف الأرشيف كاملًا وخريطة بصماته بقرار المالك؛ حفظ الأصل والحقوق وSHA في source-provenance؛ التاريخ باقٍ في Git | استقلال + checkout نظيف |
| أدوات `reference-paths`، fixture/capture/compare/benchmark-reference/extract-source-schema/generate-block-contracts/inventory-refresh | تتبع AST وrg أظهر أنها تحمّل Prisma أو snapshots تحت .migration/reference أو تقارن خادمين قديمين؛ ليست ضمن أوامر الصيانة الحالية | حذف 22 أداة انتهت مرحلتها؛ لا بديل مصدر قديم ولا مولّد توقعات من المنتج | lint، استقلال، اختبارات العقود |
| CI `reference` | checkout ثابت لـa2dc18c، setup-bun، Bun/Next build | إزالة هذه المهمة وحدها؛ تسمية Web quality checks. كل فحوص المنتج ومهارات UI/UX محفوظة | CI الحالي + كل أوامره محليًا |
| `tools/test/runtime-independence*` | apps/packages/tools/tests/ops/config/CI/npm lock | تحديث بدل حذف؛ فحص AST للاستيراد والتصدير وdynamic import وCommonJS والـalias والمكونات المركبة للمسار؛ منع إطار Next/Prisma/Bun والمصدر الخارجي وcheckout CI تاريخي، مع حالات رفض إيجابية وسلبية | `test:independence`، 3 حالات سياسة تغطي عدة طرق تحميل |
| `docs/migration/api-inventory.json` | API/OpenAPI وrole-contracts في E2E | نقل بايتات ثابتة إلى `tests/fixtures/api-inventory.json` وتحديث القارئين | E2E، بصمة مطابقة |
| `legacy-size-ranking.json` | CMS stress: 27 نوع كتلة، 60 كتلة قصوى، توقعات ترتيب/أحجام | نقل بايتات ثابتة إلى tests/fixtures وتحديث smoke وسجل oracle؛ لا تغيير توقع أو حد | CMS boundaries، بصمة مطابقة |
| source-block-contracts، public-content، auth-axe-baseline، schema-v1/v2 وSQL fixtures | عقود خصائص/تطبيع؛ بيانات متصفح؛ قائمة axe فارغة؛ نقل v1/v2 | إبقاء بقيمها الأصلية؛ توثيق القراء والبصمات في tests/fixtures/README | الوحدة/MariaDB والمتصفح |
| `public/` الجذري | 8 أسماء مطابقة بايتًا لأصول apps/web/public؛ مستهلكه الحالي الوحيد حزمة الاستعادة | حذف التكرار؛ إبقاء **كل الأصول العشرة** في apps/web/public، بما فيها icon.png وapple-icon.png المختلفان بالأسماء | جميع الأصول عبر HTTP من release مستعاد |
| `operational-restore.mjs` | Nest يخدم apps/web/public وdist/assets، بينما tar القديم ينقل public الجذري | تضمين apps/web/public؛ فحص البايتات لكل الأصول وCSS وكل woff2، ومنع أي symlink خارج الإصدار المستعاد | الاستعادة الكاملة، عامل مستعاد، ملفات وجلسات وطابور ومفاتيح |
| `components/home` (7)، `components/pages` (6)، `hooks` (2)، UI غير المستخدمة (25) | رسم اعتمادات AST من entry-client/entry-server **وكل اختبارات وأدوات** المستودع، exports وlazy imports؛ routes في app.tsx وCMS PageRenderer/TreePageRenderer؛ لا file glob يحمّلها | حذف 40 ملفًا؛ عدم حذف شاشات أو renderer أو route. الواجهة العامة الحالية منشورة من CMS | build، الوحدة، E2E ar/en 375/1280، كيبورد وaxe |
| 28 اعتمادًا مباشرًا | AST وrg عبر جميع workspaces/tools/tests وCSS/config؛ مراجعة plugins/CLI/peers؛ أصبحت بلا استيراد بعد حذف UI أو كانت موروثة أصلًا | `npm uninstall` بالإصدارات المثبتة؛ 183 مدخل حزمة أقل في القفل؛ إبقاء next-themes المستخدم، tw-animate-css وVite/Tailwind/TypeORM وأدوات CLI | npm ci، lint/typecheck/build/full tests؛ لا تغيير إصدارات الحزم الباقية |
| `packages/server/src/database/migrations`، `src/migration` وأدوات smoke/benchmark الحالية | data:backup/recovery-check/transfer؛ اختبارات bcrypt/records/ownership/restart؛ worker/auth/webhook/CMS/files؛ benchmark المحادثات وupgrade v2 | إبقاء **كل ترحيلات قاعدة البيانات** وكل وظيفة صيانة حالية، بما فيها استيراد SQLite بمدخلات المشغل دون التطبيق القديم | MariaDB + جميع smoke/restore + v1/v2 tests |
| `.agents`، skill by skill | Archify يعيد توليد مخططات سُحُب، tests تستخدم أمثلته؛ ui-ux-pro-max في CI؛ أدوات brand/design-system/design/banner/slides/ui-styling من المالك ومترابطة | إبقاء الثماني مع أسبابها في .agents/README؛ لا دليل انتهاء وظيفة الأدوات المترابطة. skills-lock لم يتغير | Python UI/UX offline contracts؛ عدم إدخالها للـruntime |
| `.archify` | HTML/source/receipts سُحُب مرتبطة بالتوثيق؛ agent examples لا تصف المنتج؛ صور final-review مكررة SHA-256 | حذف مجلدي أمثلة الوكلاء وتقاريرهما المنتهية؛ حذف صور مكررة وcandidate نسخة مطابقة؛ إبقاء مخططات سُحُب والأصل وcanonical captures وreceipts | روابط الفهرس ومطابقة البايتات قبل حذف التكرار |
| docs source/reports/screenshots/verification وفهارس import/refresh/file-map وcontinuation prompt | تاريخ Website القديم؛ لا قارئ اختبار حالي بعد فصل fixtures؛ prompt يأمر باستئناف النقل وانتهى | حذف المصدر المنسوخ وفهارسه وتقارير/صور تدقيق المصدر، دون أرشفة جديدة؛ روابط Git مثبتة للأصل والحقوق. أدلة قبول web وfinal-code-parity وaudit-70/72 باقية | بحث القراء والروابط؛ docs/README يفصل الحالي عن التاريخ |
| مخرجات البناء والكاش | لا dist/tsbuildinfo/log/test-results متتبعة خطأً؛ نتائج القبول ليست caches | لم تُحذف ملفات محلية أو بيانات/رفع/نسخ قائمة؛ تجاهل Python bytecode أيضًا | status قبل/بعد + diff check |

الاعتمادات المباشرة المحذوفة: @hookform/resolvers، @reactuses/core، @tanstack/react-query/table، Radix aspect-ratio/avatar/collapsible/context-menu/hover-card/menubar/navigation-menu/progress/separator/toast/toggle/toggle-group، embla-carousel-react، input-otp، react-day-picker، react-hook-form، react-markdown، react-resizable-panels، react-syntax-highlighter، recharts، tailwindcss-animate، uuid، vaul، zustand. `@radix-ui/react-slot` بقي اعتمادًا مباشرًا لازمًا لـbutton/sheet بنسخته المقفلة الموجودة أصلًا 1.2.4.

لم تُحذف أصول عامة متفردة أو snapshots قبول web اعتمادًا على غياب استيراد نصي. بقيت صور CMS والأصول والخطوط، ومكوّنات UI المستخدمة، والترجمات وهوية وروابط المنتج. أدلة التاريخ تشير لنسختها وقت التشغيل ولا تُعرض كتأكيد للنسخة الحالية.

## الأساس قبل التغيير

`lint` و`typecheck` و`test:independence` ناجحة على الشجرة الابتدائية؛ الاستقلال القديم تحقق من 2429 import و338 ملف أرشيف. `npm test` على MariaDB 10.11.18 جديدة: **49 ملفًا / 895 اختبارًا ناجحًا**. البناء على develop@aea8624 نجح والشجرة clean؛ build-info يثبت SHA وdirty=false.

محاولة تصوير اختيارية للخط الأساسي رُفضت بـHTTP 500 لأن harness صدّر NODE_ENV=test إلى Vite build ثم شغّل API production (jsxDEV غير متوفر في React production). هذا خطأ إعداد الفحص، لا نتيجة مقارنة بصرية مقبولة ولا عيبًا مثبتًا للمنتج. التحقق النهائي يبني مع NODE_ENV غير مضبوط كما في CI؛ لا تعديل لأداة المنتج أو اختباراته لتجاوز المحاولة.

## إثبات الاستقلال ونتائج النسخة

سيُملأ هذا القسم بالنتائج الفعلية من worktree جديد قبل التسليم. لا تُنسب نتيجة pending إلى النجاح. الإعداد والأوامر المستقلة موثقة في [docs/testing](../testing.md). تستخدم التجربة MariaDB **منفصلة بالكامل** على loopback:33777، بحد packet=256MiB وقواعد جديدة للأجزاء المختلفة؛ لا تغيير لمثيل MariaDB الحالي على 3306 أو بياناته.

## التراجع والحدود

التراجع عبر `git revert` لالتزامات PR ثم npm ci والبناء من القفل. لا migration جديدة أو تغيير مخطط أو بيانات تشغيل؛ لا restore قديم فوق كتابات أحدث. المرجع المحذوف يبقى في تاريخ Git، ولا حاجة لإعادته لإصلاح المنتج الحالي. فحوص الاستعادة محلية اصطناعية؛ لا تثبت فقد مضيف أو وصول البريد للمستلم أو نقل بيانات إنتاج أو نشرًا. الدمج والنشر بقرار مراجعة مستقل.

قياس عدد/بايتات الملفات المتتبعة سيُضاف بعد commit النهائي؛ هذا قياس للشجرة الحالية، لا لحجم تاريخ Git أو gzip حزمة الموقع. الحذف لا يمحو التاريخ ولا يضمن تسريع التطبيق.
