import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

/** Stable case IDs and timings only; never record arguments, URLs or credentials. */
export default class CaseReporter implements Reporter {
  private cases: Array<Record<string,unknown>> = [];
  private catalog: string[] = [];
  private started = 0;
  onBegin(_config: FullConfig, suite: Suite) { this.started=performance.now();this.catalog=suite.allTests().map(test=>test.id); }
  onTestEnd(test: TestCase, result: TestResult) {
    this.cases.push({id:test.id,file:relative(process.cwd(),test.location.file),project:test.parent.project()?.name,title:test.title,status:result.status,expectedStatus:test.expectedStatus,retry:result.retry,milliseconds:result.duration});
  }
  onEnd(result: FullResult) {
    const path=process.env.SO7OB_E2E_RESULT_FILE;
    if (!path) return;
    mkdirSync(dirname(path),{recursive:true});
    writeFileSync(path,JSON.stringify({status:result.status,milliseconds:performance.now()-this.started,catalog:this.catalog,cases:this.cases},null,2)+'\n');
  }
}
