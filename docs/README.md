# فهرس وثائق سُحُب

## التطوير والتشغيل الحالي

- [التشغيل المحلي وتهيئة موقع ومدير جديدين](migration/local-development.ar.md).
- [تهيئة الفحوص من checkout نظيف](testing.md) و[تعليمات المساهمة](../CONTRIBUTING.md).
- [العامل والطوابير](migration/worker-and-operations.md)، [صحة العامل](migration/worker-health-50.md)، [إعدادات التشغيل](../ops/).
- [النسخ ونقل البيانات](migration/data-transfer.md)، [الاستعادة المحلية](migration/operational-restore.md)، [حدود الاستعادة على مضيف مستقل](migration/independent-recovery-56.md).
- [تشغيل التدقيق والصلاحيات والاحتفاظ](migration/audit-70/runbook.md)، [التشخيص المنقح](migration/error-diagnostics-61.md)، [حدود CMS](migration/cms-boundaries.md).
- [شرح البنية المثبت بالمصدر](migration/architecture-explained-2026-10-09.ar.md)، [المخططات المعتمدة](../.archify/README.md)، [الإصدارات](releases/v1.2.0.md).
- [تقرير التنظيف والاستقلال #77](migration/repository-cleanup-77.md)، [أصل الشيفرة والحقوق](migration/source-provenance.md).

## العقود والأدلة والتاريخ

[test fixtures](../tests/fixtures/README.md) مدخلات لازمة للفحوص الحالية؛ ليست توثيقًا زائدًا. `docs/migration/audit-70` و`audit-72` وسجلات الإصلاحات وأدلة `docs/migration/evidence` تحفظ قبول المنتج والقياسات وحدودها عند SHAs محددة؛ لا تُنسب إلى نسخة أحدث دون إعادة التحقق.

[فهرس مراحل النقل](migration/README.md) و[القبول النهائي](migration/final-code-parity.md) تاريخ تنفيذ web، وقد تذكر أدوات ومسارات انتهت مرحلتها. التاريخ ليس تعليمات تشغيل حالية. فهارس الأرشيف وتقارير وصور Website القديمة حُذفت من الشجرة الحالية؛ روابطها المثبتة في Git موجودة في [أصل الشيفرة](migration/source-provenance.md). لا يلزم استعادتها للبناء أو الاختبار أو التشغيل. لا يوجد أرشيف بديل داخل المشروع.

## أدوات التطوير

المهارات المحلية موثقة في [agent-skills](migration/agent-skills.md) و[فهرسها](../.agents/README.md). مخططات سُحُب وأصولها المعتمدة تحت `.archify`؛ أزيلت نسخ أمثلة الوكلاء العامة والمخرجات المكررة التي لا تصف المنتج. هذه الأدوات لا تدخل حزمة الموقع أو runtime.
